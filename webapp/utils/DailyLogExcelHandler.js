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
                if (window.XLSX) {
                    resolve(window.XLSX);
                    return;
                }
                // Try downloading via getScript
                var sUrl = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                sap.ui.require(["sap/ui/thirdparty/jquery"], function (jQuery) {
                    jQuery.getScript(sUrl)
                        .done(function () {
                            if (window.XLSX) {
                                resolve(window.XLSX);
                            } else {
                                reject(new Error("Thư viện XLSX chưa được tải thành công!"));
                            }
                        })
                        .fail(function () {
                            reject(new Error("Không thể tải thư viện XLSX từ CDN!"));
                        });
                });
            });
        },

        /**
         * Export Excel with dynamic data or a blank template if no data is provided.
         * @param {Array} aLogs - Array of DailyLog objects.
         * @param {Array} aResources - Array of ResourceUse objects linked to the logs.
         */
        exportDailyLogs: function (aLogs, aResources) {
            var that = this;
            this._loadXlsxLibrary().then(function (XLSX) {
                try {
                    var wb = XLSX.utils.book_new();

                    // Generate DailyLog Sheet Data
                    var dailyLogData = [
                        ["CONSTRUCTION DAILY LOG"],
                        [],
                        ["No.", "Report Date", "Quantity Done", "Morning Weather", "Afternoon Weather", "General Note", "Safety Note", "Contractor Note"]
                    ];

                    if (aLogs && aLogs.length > 0) {
                        aLogs.forEach(function (log, index) {
                            var dD = log.LogDate;
                            var sDate = dD ? (dD.getDate().toString().padStart(2, '0') + "/" + (dD.getMonth() + 1).toString().padStart(2, '0') + "/" + dD.getFullYear()) : "";
                            var sAm = log.WeatherAm || "SUNNY";
                            var sPm = log.WeatherPm || "SUNNY";
                            var sNo = (index + 1).toString();

                            dailyLogData.push([
                                sNo,
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
                        dailyLogData.push(["1", "28/02/2026", "100", "SUNNY", "COOL", "General construction work", "Safety checked", "On schedule"]);
                    }

                    dailyLogData.push([]);
                    dailyLogData.push(["NOTES:"]);
                    dailyLogData.push(["- No.: Reference Number to link Resources (Sheet 2) to this Log."]);
                    dailyLogData.push(["- Quantity Done: Number format required."]);
                    dailyLogData.push(["- Weather: Enter 'SUNNY', 'COOL', or 'RAINY'."]);

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
                        ["RESOURCE USAGE"],
                        [],
                        ["Log No.", "Resource ID", "Quantity"]
                    ];

                    // Generate Resource Master Sheet Data
                    var resourceMasterData = [
                        ["RESOURCE MASTER"],
                        [],
                        ["Resource ID", "Resource Name", "Type", "Unit"]
                    ];

                    var oAddedResIds = {};

                    if (aResources && aResources.length > 0) {
                        aResources.forEach(function (res) {
                            var iLogIndex = aLogs.findIndex(function (l) { return l.LogId === res.LogId; });
                            var iLogNo = iLogIndex >= 0 ? (iLogIndex + 1) : 1;

                            resourceUseData.push([
                                iLogNo.toString(),
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
                        resourceUseData.push(["1", "XI_MANG", "1"]);
                        resourceMasterData.push(["XI_MANG", "Cement", "MATERIAL", "KG"]);
                    }

                    resourceUseData.push([]);
                    resourceUseData.push(["NOTES:"]);
                    resourceUseData.push(["- Log No.: Must match the No. from the DailyLog sheet."]);
                    resourceUseData.push(["- Resource ID: Required field. Must exist in Resource Master sheet."]);

                    var ws2 = XLSX.utils.aoa_to_sheet(resourceUseData);
                    ws2['!cols'] = [
                        { wch: 12 }, // Log No
                        { wch: 18 }, // Resource ID
                        { wch: 15 }  // Quantity
                    ];

                    XLSX.utils.book_append_sheet(wb, ws2, "ResourceUsage");

                    resourceMasterData.push([]);
                    resourceMasterData.push(["NOTES:"]);
                    resourceMasterData.push(["- Resource ID: Unique identifier."]);
                    resourceMasterData.push(["- Type: 'MATERIAL', 'EQUIPMENT', or 'LABOR'."]);

                    var ws3 = XLSX.utils.aoa_to_sheet(resourceMasterData);
                    ws3['!cols'] = [
                        { wch: 18 }, // Resource ID
                        { wch: 25 }, // Resource Name
                        { wch: 15 }, // Type
                        { wch: 10 }  // Unit
                    ];

                    XLSX.utils.book_append_sheet(wb, ws3, "ResourceMaster");

                    // Download file
                    var sFileName = (aLogs && aLogs.length > 0) ? "DailyLogs_Export.xlsx" : "DailyLog_Template.xlsx";
                    XLSX.writeFile(wb, sFileName);
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
        transformExcelData: function (dailyLogRows, resourceUseRows, resourceMasterRows) {
            var results = [];

            // Map thời tiết
            var weatherMap = {
                "SUNNY": "SUNNY",
                "COOL": "COOL",
                "RAINY": "RAINY",
                "Nắng": "SUNNY", // Backward compatibility
                "Mát mẻ": "COOL",
                "Mưa": "RAINY"
            };

            // Tạo map resource master
            var masterMap = {};
            if (resourceMasterRows && resourceMasterRows.length > 3) {
                for (var j = 3; j < resourceMasterRows.length; j++) {
                    var mRow = resourceMasterRows[j];
                    if (!mRow || mRow.length === 0) continue;

                    var resId = mRow[0] ? mRow[0].toString().trim() : "";
                    if (!resId || resId.indexOf("NOTES") >= 0) continue;

                    masterMap[resId] = {
                        resource_name: mRow[1] ? mRow[1].toString() : "",
                        resource_type: mRow[2] ? mRow[2].toString() : "MATERIAL",
                        unit_code: mRow[3] ? mRow[3].toString() : ""
                    };
                }
            }

            // Tạo map resources use theo mã nhật ký
            var resourceMap = {};
            if (resourceUseRows && resourceUseRows.length > 3) {
                for (var i = 3; i < resourceUseRows.length; i++) {
                    var resRow = resourceUseRows[i];
                    if (!resRow || resRow.length === 0) continue;

                    var logId = resRow[0] ? resRow[0].toString().trim() : "";
                    if (!logId || logId.indexOf("NOTES") >= 0 || logId.indexOf("LƯU Ý") >= 0) continue;

                    if (!resourceMap[logId]) {
                        resourceMap[logId] = [];
                    }

                    var rId = resRow[1] ? resRow[1].toString() : "";
                    var mData = masterMap[rId] || {};

                    resourceMap[logId].push({
                        log_no: logId,
                        resource_id: rId,
                        resource_name: mData.resource_name || "",
                        resource_type: mData.resource_type || "MATERIAL",
                        quantity: parseFloat(resRow[2]) || 0,
                        unit_code: mData.unit_code || "KG"
                    });
                }
            }

            // Parse Daily Log (bắt đầu từ dòng 3, dòng 0-2 là header)
            if (dailyLogRows && dailyLogRows.length > 3) {
                for (var i = 3; i < dailyLogRows.length; i++) {
                    var row = dailyLogRows[i];

                    // Bỏ qua dòng trống hoặc dòng ghi chú
                    if (!row || row.length === 0 || !row[1] || row[1].toString().trim() === "") continue;
                    if (row[0] && (row[0].toString().indexOf("NOTES") >= 0 || row[0].toString().indexOf("LƯU Ý") >= 0)) break;

                    try {
                        var logNo = row[0] ? row[0].toString().trim() : "";
                        var dateStr = row[1] ? row[1].toString().trim() : "";
                        var logDate = this._parseDate(dateStr);
                        var qtyDone = parseFloat(row[2]) || 0;

                        var resources = resourceMap[logNo] || [];

                        var dailyLog = {
                            log_id: "", // Always force Create New
                            wbs_id: "", // Supplied by controller from current view mode
                            qty_done: qtyDone,
                            log_date: logDate,
                            weather_am: weatherMap[row[3]] || "SUNNY",
                            weather_pm: weatherMap[row[4]] || "SUNNY",
                            general_note: row[5] ? row[5].toString() : "",
                            safe_note: row[6] ? row[6].toString() : "",
                            contractor_note: row[7] ? row[7].toString() : "",
                            resources: resources
                        };

                        results.push(dailyLog);
                    } catch (e) {
                        console.error("Error parsing row " + i + ":", e, row);
                    }
                }
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
