sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

    return {
        /**
         * Dynamically loads the XLSX library if not already available
         */
        _loadXlsxLibrary: function () {
            return new Promise(function (resolve, reject) {
                // Already loaded
                if (window.XLSX) {
                    resolve(window.XLSX);
                    return;
                }

                // Resolve the correct URL using SAP UI5's module path system
                // This works both locally and when deployed on SAP FLP / BSP
                var sUrl = sap.ui.require.toUrl("z/bts/buildtrack551/libs/xlsx.full.min.js");

                fetch(sUrl)
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error("HTTP " + response.status + " when loading " + sUrl);
                        }
                        return response.text();
                    })
                    .then(function (sCode) {
                        // Execute XLSX with AMD temporarily disabled so it sets window.XLSX
                        var savedDefine = window.define;
                        window.define = undefined;
                        try {
                            // eslint-disable-next-line no-new-func
                            new Function(sCode)();
                        } finally {
                            window.define = savedDefine;
                        }
                        if (window.XLSX) {
                            resolve(window.XLSX);
                        } else {
                            reject(new Error("XLSX library loaded but window.XLSX is still undefined"));
                        }
                    })
                    .catch(function (err) {
                        reject(new Error("Không thể tải thư viện XLSX: " + err.message));
                    });
            });
        },


        /**
         * Export Excel with dynamic data or a blank template if no data is provided.
         * @param {Array} aLogs - Array of DailyLog objects.
         * @param {Array} aResources - Array of ResourceUse objects linked to the logs.
         * @param {Object} oBundle - The i18n resource bundle for multilinguality.
         */
        exportDailyLogs: function (aLogs, aResources, oBundle) {
            var that = this;

            var _getText = function (sKey, sFallback) {
                if (oBundle) {
                    var sRet = oBundle.getText(sKey);
                    return sRet !== sKey ? sRet : sFallback;
                }
                return sFallback;
            };

            this._loadXlsxLibrary().then(function (XLSX) {
                try {
                    var wb = XLSX.utils.book_new();

                    // Generate DailyLog Sheet Data
                    var dailyLogData = [
                        [_getText("excelTitle", "CONSTRUCTION DAILY LOG")],
                        [],
                        [
                            _getText("excelNo", "Log Num"),
                            _getText("excelReportDate", "Report Date"),
                            _getText("excelQuantity", "Quantity Done"),
                            _getText("excelMorningWea", "Morning Weather"),
                            _getText("excelAfternoonWea", "Afternoon Weather"),
                            _getText("excelGeneralNote", "General Note"),
                            _getText("excelSafetyNote", "Safety Note"),
                            _getText("excelContractorNote", "Contractor Note")
                        ]
                    ];

                    var wMap = {
                        "SUNNY": _getText("excelSunny", "SUNNY"),
                        "COOL": _getText("excelCool", "COOL"),
                        "RAINY": _getText("excelRainy", "RAINY")
                    };

                    if (aLogs && aLogs.length > 0) {
                        aLogs.forEach(function (log, idx) {
                            var iLogNum = idx + 1;  // sequential 1-based number
                            var dD = log.LogDate;
                            var sDate = dD ? (dD.getDate().toString().padStart(2, '0') + "/" + (dD.getMonth() + 1).toString().padStart(2, '0') + "/" + dD.getFullYear()) : "";
                            var sAm = wMap[log.WeatherAm] || wMap["SUNNY"];
                            var sPm = wMap[log.WeatherPm] || wMap["SUNNY"];

                            // Store the mapping LogId -> LogNum for resource linking
                            log._exportNum = iLogNum;

                            dailyLogData.push([
                                iLogNum,
                                sDate,
                                log.QuantityDone || 0,
                                sAm,
                                sPm,
                                log.GeneralNote || "",
                                log.SafeNote || "",
                                log.ContractorNote || ""
                            ]);
                        });
                    } else {
                        // Template fallback
                        dailyLogData.push([1, "28/02/2026", "100", wMap["SUNNY"], wMap["COOL"], _getText("excelFallbackNote1", "General construction work"), _getText("excelFallbackNote2", "Safety checked"), _getText("excelFallbackNote3", "Material delivered")]);
                    }

                    dailyLogData.push([]);
                    dailyLogData.push([_getText("excelNotes", "NOTES:")]);
                    dailyLogData.push([_getText("excelNote1", "- Log Num: Sequential number to link Resources to this Log. Do NOT change.")]);
                    dailyLogData.push([_getText("excelNote2", "- Quantity Done: Number format required.")]);
                    dailyLogData.push([_getText("excelNote3", "- Weather: Enter 'SUNNY', 'COOL', or 'RAINY'.")]);

                    var ws1 = XLSX.utils.aoa_to_sheet(dailyLogData);

                    // Set Column Widths
                    ws1['!cols'] = [
                        { wch: 10 }, // No.
                        { wch: 15 }, // Report Date
                        { wch: 15 }, // Quantity done
                        { wch: 18 }, // Morning Weather
                        { wch: 18 }, // Afternoon Weather
                        { wch: 40 }, // General Note
                        { wch: 30 }, // Safety Note
                        { wch: 30 }  // Contractor Note
                    ];

                    XLSX.utils.book_append_sheet(wb, ws1, "DailyLog");

                    // Generate Resource Use Sheet Data
                    var resourceUseData = [
                        [_getText("excelResourceUsage", "RESOURCE USAGE (MATERIALS/EQUIPMENT/LABOR)")],
                        [],
                        [_getText("excelNo", "Log Num"), _getText("excelResId", "Resource ID"), _getText("excelQuantityUsed", "Quantity")]
                    ];

                    // Generate Resource Master Sheet Data
                    var resourceMasterData = [
                        [_getText("excelResMaster", "RESOURCE MASTER (REFERENCE)")],
                        [],
                        [_getText("excelResId", "Resource ID"), _getText("excelResName", "Resource Name"), _getText("excelType", "Type"), _getText("excelUnit", "Unit")]
                    ];

                    var oAddedResIds = {};
                    // Build a reverse map: LogId -> LogNum (from enriched aLogs)
                    var oLogNumMap = {};
                    if (aLogs) {
                        aLogs.forEach(function (log) {
                            if (log.LogId && log._exportNum) {
                                oLogNumMap[log.LogId] = log._exportNum;
                            }
                        });
                    }

                    if (aResources && aResources.length > 0) {
                        aResources.forEach(function (res) {
                            var iLogNum = oLogNumMap[res.LogId] || "";
                            resourceUseData.push([
                                iLogNum,
                                res.ResourceId || "",
                                res.Quantity || 0
                            ]);

                            if (res.ResourceId && !oAddedResIds[res.ResourceId]) {
                                resourceMasterData.push([
                                    res.ResourceId || "",
                                    res.ResourceName || "",
                                    res.ResourceType || "MATERIAL",
                                    res.UnitCode || ""
                                ]);
                                oAddedResIds[res.ResourceId] = true;
                            }
                        });
                    } else {
                        resourceUseData.push([1, "XI_MANG", "1"]);
                        resourceMasterData.push(["XI_MANG", _getText("excelCement", "Cement"), "MATERIAL", "KG"]);
                    }

                    resourceUseData.push([]);
                    resourceUseData.push([_getText("excelNotes", "NOTES:")]);
                    resourceUseData.push([_getText("excelResNote1", "- Log Num: Must match the Log Num from the DailyLog sheet.")]);
                    resourceUseData.push([_getText("excelResNote2", "- Resource ID: Required field. Must exist in Resource Master sheet.")]);

                    var ws2 = XLSX.utils.aoa_to_sheet(resourceUseData);
                    ws2['!cols'] = [
                        { wch: 12 }, // Log No
                        { wch: 18 }, // Resource ID
                        { wch: 15 }  // Quantity
                    ];

                    XLSX.utils.book_append_sheet(wb, ws2, "ResourceUsage");

                    resourceMasterData.push([]);
                    resourceMasterData.push([_getText("excelNotes", "NOTES:")]);
                    resourceMasterData.push([_getText("excelResNote3", "- Resource ID: Unique identifier.")]);
                    resourceMasterData.push([_getText("excelResNote4", "- Type: 'MATERIAL', 'EQUIPMENT', or 'LABOR'.")]);

                    var ws3 = XLSX.utils.aoa_to_sheet(resourceMasterData);
                    ws3['!cols'] = [
                        { wch: 18 }, // Resource ID
                        { wch: 25 }, // Resource Name
                        { wch: 15 }, // Type
                        { wch: 10 }  // Unit
                    ];

                    XLSX.utils.book_append_sheet(wb, ws3, "ResourceMaster");

                    // Download file
                    var sFileNameVal = (aLogs && aLogs.length > 0) ? _getText("excelFileNameExport", "DailyLogs_Export.xlsx") : _getText("excelFileNameTemplate", "DailyLog_Template.xlsx");
                    XLSX.writeFile(wb, sFileNameVal);
                    MessageToast.show("Đã tải xuống thành công!");

                } catch (error) {
                    console.error("Error exporting Excel:", error);
                    MessageToast.show("Lỗi khi xuất hệ thống: " + error.message);
                }
            }).catch(function (err) {
                MessageToast.show(err.message);
            });
        },

        /**
         * Parse Excel file và trả về dữ liệu
         * @param {File} file - Excel file
         * @returns {Promise} - Promise với dữ liệu parsed
         */
        parseExcelFile: function (file) {
            var that = this;
            return new Promise(function (resolve, reject) {
                that._loadXlsxLibrary().then(function (XLSX) {
                    try {
                        var reader = new FileReader();

                        reader.onload = function (e) {
                            try {
                                var data = new Uint8Array(e.target.result);
                                var workbook = XLSX.read(data, { type: 'array', cellDates: true });

                                // Đọc Sheet 1: DailyLog
                                var dailyLogSheet = workbook.Sheets[workbook.SheetNames[0]];
                                var dailyLogJson = XLSX.utils.sheet_to_json(dailyLogSheet, {
                                    header: 1,
                                    raw: false,
                                    dateNF: 'dd/mm/yyyy'
                                });

                                // Đọc Sheet 2: Resource Use
                                var resourceUseSheet = workbook.Sheets[workbook.SheetNames[1]] || null;
                                var resourceUseJson = resourceUseSheet ? XLSX.utils.sheet_to_json(resourceUseSheet, {
                                    header: 1,
                                    raw: false
                                }) : [];

                                // Đọc Sheet 3: Resource Master
                                var resourceMasterSheet = workbook.Sheets[workbook.SheetNames[2]] || null;
                                var resourceMasterJson = resourceMasterSheet ? XLSX.utils.sheet_to_json(resourceMasterSheet, {
                                    header: 1,
                                    raw: false
                                }) : [];

                                resolve({
                                    dailyLogs: dailyLogJson,
                                    resourceUses: resourceUseJson,
                                    resourceMasters: resourceMasterJson,
                                    sheetNames: workbook.SheetNames
                                });
                            } catch (parseError) {
                                reject(parseError);
                            }
                        };

                        reader.onerror = function (error) {
                            reject(error);
                        };

                        reader.readAsArrayBuffer(file);

                    } catch (error) {
                        reject(error);
                    }
                }).catch(function (error) {
                    reject(error);
                });
            });
        },

        /**
         * Chuyển đổi dữ liệu Excel thành format của model
         * @param {Array} dailyLogRows - Dữ liệu từ sheet DailyLog
         * @param {Array} resourceRows - Dữ liệu từ sheet Resources
         * @returns {Array} - Mảng các object daily log
         */
        transformExcelData: function (dailyLogRows, resourceUseRows, resourceMasterRows, oBundle) {
            var results = [];
            var aErrors = [];

            var _getText = function (sKey, aArgs, sFallback) {
                if (oBundle) {
                    var sRet = oBundle.getText(sKey, aArgs);
                    return sRet !== sKey ? sRet : sFallback;
                }
                return sFallback;
            };

            var _isValidNumber = function (str) {
                if (str === null || str === undefined || str.toString().trim() === "") return false;
                var n = Number(str.toString().trim());
                return !isNaN(n);
            };

            // Map thời tiết (Valid maps only)
            var weatherMap = {
                "SUNNY": "SUNNY",
                "COOL": "COOL",
                "RAINY": "RAINY",
                "Nắng": "SUNNY", // Backward compatibility
                "Mát mẻ": "COOL",
                "Mưa": "RAINY"
            };

            // 1. Tạo map resource master & Validate
            var masterMap = {};
            if (resourceMasterRows && resourceMasterRows.length > 3) {
                for (var j = 3; j < resourceMasterRows.length; j++) {
                    var mRow = resourceMasterRows[j];
                    if (!mRow || mRow.length === 0) continue;

                    var resIdRaw = mRow[0] !== undefined ? mRow[0].toString().trim() : "";
                    if (!resIdRaw || resIdRaw.indexOf("NOTES") >= 0 || resIdRaw.indexOf("LƯU Ý") >= 0) break;

                    var resName = mRow[1] ? mRow[1].toString().trim() : "";
                    var resType = mRow[2] ? mRow[2].toString().toUpperCase().trim() : "MATERIAL";
                    var unitCode = mRow[3] ? mRow[3].toString().trim() : "";

                    if (!resIdRaw || !resName || !unitCode || ["MATERIAL", "EQUIPMENT", "LABOR"].indexOf(resType) === -1) {
                        aErrors.push(_getText("errResMasterInvalid", [j + 1], "Sheet RESOURCE MASTER, Row " + (j + 1) + ": Resource information is invalid."));
                    }

                    masterMap[resIdRaw] = {
                        resource_name: resName,
                        resource_type: resType,
                        unit_code: unitCode
                    };
                }
            }

            // 2. Tạo map resources use theo mã nhật ký & Validate
            var resourceMap = {};
            var usedResourceLogNums = {};
            if (resourceUseRows && resourceUseRows.length > 3) {
                for (var i = 3; i < resourceUseRows.length; i++) {
                    var resRow = resourceUseRows[i];
                    if (!resRow || resRow.length === 0) continue;

                    var logNum = resRow[0] !== undefined ? resRow[0].toString().trim() : "";
                    if (!logNum || logNum.indexOf("NOTES") >= 0 || logNum.indexOf("LƯU Ý") >= 0) break;

                    var rId = resRow[1] ? resRow[1].toString().trim() : "";
                    if (!rId) {
                        aErrors.push(_getText("errResUsageNoId", [i + 1], "Sheet RESOURCE USAGE, Row " + (i + 1) + ": Resource ID is required."));
                    } else if (!masterMap[rId]) {
                        aErrors.push(_getText("errResUsageUnknownId", [i + 1, rId], "Sheet RESOURCE USAGE, Row " + (i + 1) + ": Resource '" + rId + "' not found."));
                    }

                    var qtyStrUse = resRow[2] !== undefined ? resRow[2].toString().trim() : "";
                    var fQty = 0;
                    if (!_isValidNumber(qtyStrUse)) {
                        aErrors.push(_getText("errResUsageQty", [i + 1], "Sheet RESOURCE USAGE, Row " + (i + 1) + ": Quantity must be > 0."));
                    } else {
                        fQty = Number(qtyStrUse);
                        if (fQty <= 0) {
                            aErrors.push(_getText("errResUsageQty", [i + 1], "Sheet RESOURCE USAGE, Row " + (i + 1) + ": Quantity must be > 0."));
                        }
                    }

                    if (!resourceMap[logNum]) {
                        resourceMap[logNum] = [];
                    }

                    var mData = masterMap[rId] || {};

                    resourceMap[logNum].push({
                        log_num: logNum,
                        resource_id: rId,
                        resource_name: mData.resource_name || "",
                        resource_type: mData.resource_type || "MATERIAL",
                        quantity: isNaN(fQty) ? 0 : fQty,
                        unit_code: mData.unit_code || "KG"
                    });
                    usedResourceLogNums[logNum] = true;
                }
            }

            // 3. Parse Daily Log & Validate
            var processedLogNums = {};
            if (dailyLogRows && dailyLogRows.length > 3) {
                for (var k = 3; k < dailyLogRows.length; k++) {
                    var row = dailyLogRows[k];

                    if (!row || row.length === 0) continue;

                    var tempFirstCol = row[0] !== undefined ? row[0].toString().trim() : "";
                    // Bỏ qua dòng trống hoặc end-of-data
                    if (!tempFirstCol && (!row[1] || row[1].toString().trim() === "")) continue;
                    if (tempFirstCol.indexOf("NOTES") >= 0 || tempFirstCol.indexOf("LƯU Ý") >= 0) break;

                    var logNumD = row[0] !== undefined ? row[0].toString().trim() : "";
                    if (!logNumD) {
                        aErrors.push(_getText("errDailyLogNoNum", [k + 1], "Sheet DailyLog, Row " + (k + 1) + ": Log Num is required."));
                    } else {
                        processedLogNums[logNumD] = true;
                    }

                    var dateStr = row[1] ? row[1].toString().trim() : "";
                    if (!dateStr) {
                        aErrors.push(_getText("errDailyLogNoDate", [k + 1], "Sheet DailyLog, Row " + (k + 1) + ": Report Date is required."));
                    }
                    var logDate = this._parseDate(dateStr);
                    if (dateStr && (!logDate || isNaN(logDate.getTime()))) {
                        aErrors.push(_getText("errDailyLogInvDate", [k + 1, dateStr], "Sheet DailyLog, Row " + (k + 1) + ": Date '" + dateStr + "' is invalid."));
                    }

                    var qtyStr = row[2] !== undefined ? row[2].toString().trim() : "";
                    var qtyDone = 0;
                    if (!_isValidNumber(qtyStr)) {
                        aErrors.push(_getText("errDailyLogInvQty", [k + 1, qtyStr], "Sheet DailyLog, Row " + (k + 1) + ": Quantity Done '" + qtyStr + "' must be a number."));
                    } else {
                        qtyDone = Number(qtyStr);
                    }

                    var wAm = row[3] ? row[3].toString().trim() : "";
                    var wPm = row[4] ? row[4].toString().trim() : "";

                    if (wAm && !weatherMap[wAm]) {
                        aErrors.push(_getText("errDailyLogWeaAm", [k + 1, wAm], "Sheet DailyLog, Row " + (k + 1) + ": Morning Weather '" + wAm + "' is invalid (Must be Sun/Rain/Cool)."));
                    }
                    if (wPm && !weatherMap[wPm]) {
                        aErrors.push(_getText("errDailyLogWeaPm", [k + 1, wPm], "Sheet DailyLog, Row " + (k + 1) + ": Afternoon Weather '" + wPm + "' is invalid."));
                    }

                    // Proceed to construct log if no fatal errors so far
                    var resources = resourceMap[logNumD] || [];

                    results.push({
                        log_id: "",
                        wbs_id: "",
                        log_num: logNumD,
                        qty_done: isNaN(qtyDone) ? 0 : qtyDone,
                        log_date: logDate || new Date(),
                        weather_am: weatherMap[wAm] || "SUNNY", // Store safe fallback locally
                        weather_pm: weatherMap[wPm] || "SUNNY",
                        general_note: row[5] ? row[5].toString() : "",
                        safe_note: row[6] ? row[6].toString() : "",
                        contractor_note: row[7] ? row[7].toString() : "",
                        resources: resources
                    });
                }
            }

            // 4. Cross-Sheet Validation: Check if usages reference non-existent logs
            Object.keys(usedResourceLogNums).forEach(function (lNum) {
                if (!processedLogNums[lNum]) {
                    aErrors.push(_getText("errResUsageDangling", [lNum], "Sheet RESOURCE USAGE: Log Num '" + lNum + "' does not exist in DailyLog sheet."));
                }
            });

            if (aErrors.length > 0) {
                throw new Error(aErrors.join("\n"));
            }

            return results;
        },

        /**
         * Parse ngày từ string dd/mm/yyyy
         */
        _parseDate: function (dateStr) {
            if (!dateStr) {
                var d = new Date();
                d.setHours(12, 0, 0, 0);
                return d;
            }

            // Nếu đã là Date object
            if (dateStr instanceof Date) {
                dateStr.setHours(12, 0, 0, 0);
                return dateStr;
            }

            // Parse dd/mm/yyyy
            var parts = dateStr.toString().split("/");
            if (parts.length === 3) {
                var day = parseInt(parts[0]);
                var month = parseInt(parts[1]) - 1; // Month is 0-indexed
                var year = parseInt(parts[2]);

                // Handle 2-digit years natively resolving to 19xx
                if (year < 100) {
                    year += 2000;
                }

                return new Date(year, month, day, 12, 0, 0);
            }

            var fallbackObj = new Date(dateStr);
            if (!isNaN(fallbackObj.getTime())) {
                fallbackObj.setHours(12, 0, 0, 0);
            }
            return fallbackObj;
        }
    };
});
