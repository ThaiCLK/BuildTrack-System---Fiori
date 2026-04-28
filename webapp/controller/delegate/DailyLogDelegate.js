sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/Token",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/Input",
    "z/bts/buildtrack551/utils/DailyLogExcelHandler"
], function (JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, ValueHelpDialog, FilterBar, FilterGroupItem, Token, Column, ColumnListItem, Label, Text, Input, DailyLogExcelHandler) {
    "use strict";

    return {
        init: function (oController) {
            // Local UI-state model — no mock data
            var oUIModel = new JSONModel({
                selectedLog: null,
                resourceUseList: [],
                ui: {
                    isSelected: false,
                    editMode: false,
                    isNewRecord: false,
                    busy: false,
                    selectedLogsCount: 0
                }
            });
            oUIModel.setDefaultBindingMode("TwoWay");
            oController.getView().setModel(oUIModel, "dailyLogModel");

            // Import Preview model
            var oImportPreviewModel = new JSONModel({
                logs: []
            });
            oController.getView().setModel(oImportPreviewModel, "importPreviewModel");

            // Task: Make LogDate DatePicker non-typeable (picker only)
            var oDatePicker = oController.byId("inLogDate");
            if (oDatePicker) {
                oDatePicker.addEventDelegate({
                    onAfterRendering: function () {
                        oDatePicker.$().find("input").attr("readonly", "readonly");
                    }
                });
            }
        },

        /**
         * Resets the Daily Log detail state to default (empty placeholder)
         */
        resetLogDetailState: function () {
            // "this" will be the controller instance if mixed-in
            var oUIModel = this.getView().getModel("dailyLogModel");
            if (oUIModel) {
                oUIModel.setProperty("/selectedLog", null);
                oUIModel.setProperty("/ui/isSelected", false);
                oUIModel.setProperty("/ui/editMode", false);
                oUIModel.setProperty("/ui/isNewRecord", false);
                oUIModel.setProperty("/ui/isAddMode", false);
            }
        },

        /* =========================================================== */
        /* DAILY LOG — LIST BINDING                                    */
        /* =========================================================== */

        _bindDailyLogList: function (sWbsId) {
            var that = this;
            var oTable = this.byId("idDailyLogList");
            if (!oTable) { return; }

            var oUIModel = this.getView().getModel("dailyLogModel");
            var oModel = this.getOwnerComponent().getModel();

            oTable.unbindAggregation("items");

            if (!sWbsId) { return; }
            var oFilter = new Filter("WbsId", FilterOperator.EQ, sWbsId);
            oTable.setBusy(true);

            oModel.read("/DailyLogSet", {
                filters: [oFilter],
                success: function (oData) {
                    oTable.setBusy(false);
                    var aLogs = oData.results || [];

                    // FALLBACK: Force client-side filtering because 
                    // the backend ignores the $filter=WbsId eq '...'
                    // FALLBACK: Force client-side filtering because 
                    // the backend ignores the $filter=WbsId eq '...'
                    var aFilteredLogs = aLogs.filter(function (log) {
                        // Round to integer while we are at it
                        if (log.QuantityDone !== undefined && log.QuantityDone !== null) {
                            log.QuantityDone = Math.round(parseFloat(log.QuantityDone) || 0).toString();
                        }
                        return log.WbsId && log.WbsId.toLowerCase() === sWbsId.toLowerCase();
                    });

                    // Sort descending by LogDate manually
                    aFilteredLogs.sort(function (a, b) {
                        var d1 = new Date(a.LogDate).getTime();
                        var d2 = new Date(b.LogDate).getTime();
                        return d2 - d1;
                    });

                    oUIModel.setProperty("/list", aFilteredLogs);

                    var oTemplate = new sap.m.ColumnListItem({
                        type: "Active",
                        cells: [
                            new sap.m.Text({
                                text: {
                                    path: "dailyLogModel>LogDate",
                                    type: "sap.ui.model.type.Date",
                                    formatOptions: { pattern: "dd/MM/yyyy" }
                                }
                            }),
                            new sap.m.ObjectNumber({
                                number: "{dailyLogModel>QuantityDone}",
                                unit: "{dailyLogModel>UnitCode}",
                                state: "None"
                            })
                        ],
                        press: that.onLogRowPress.bind(that)
                    });

                    oTable.bindItems({
                        path: "dailyLogModel>/list",
                        template: oTemplate,
                        templateShareable: false
                    });
                },
                error: function () {
                    oTable.setBusy(false);
                    oUIModel.setProperty("/list", []);
                }
            });
        },

        /* =========================================================== */
        /* DAILY LOG — LIST PANEL                                      */
        /* =========================================================== */

        onLogItemSelect: function (oEvent) {
            var oTable = oEvent.getSource();
            var aSelectedItems = oTable.getSelectedItems();
            this.getView().getModel("dailyLogModel").setProperty("/ui/selectedLogsCount", aSelectedItems.length);

            var oParams = oEvent.getParameters();
            if (oParams && oParams.listItem) {
                var oCtx = oParams.listItem.getBindingContext("dailyLogModel");
                this._showLogDetail(oCtx);
            } else if (aSelectedItems.length > 0) {
                var oFirstCtx = aSelectedItems[0].getBindingContext("dailyLogModel");
                this._showLogDetail(oFirstCtx);
            } else {
                this.getView().getModel("dailyLogModel").setProperty("/ui/isSelected", false);
                this.getView().getModel("dailyLogModel").setProperty("/selectedLog", null);
            }
        },

        onLogRowPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("dailyLogModel");
            this._showLogDetail(oCtx);
        },

        _showLogDetail: function (oCtx) {
            var oODataLog = oCtx.getObject();
            var oUIModel = this.getView().getModel("dailyLogModel");

            var parseDate = function (vDate) {
                if (vDate instanceof Date) return vDate;
                if (!vDate) return null;
                if (typeof vDate === "string" && vDate.indexOf("/Date(") !== -1) {
                    var timestamp = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"));
                    return new Date(timestamp);
                }
                var d = new Date(vDate);
                return isNaN(d.getTime()) ? null : d;
            };

            var oLog = {
                LogId: oODataLog.LogId,
                WbsId: oODataLog.WbsId,
                LogDate: parseDate(oODataLog.LogDate),
                WeatherAm: oODataLog.WeatherAm || "SUNNY",
                WeatherPm: oODataLog.WeatherPm || "SUNNY",
                QuantityDone: oODataLog.QuantityDone !== undefined ? Math.round(parseFloat(oODataLog.QuantityDone) || 0) : 0,
                UnitCode: oODataLog.UnitCode || "",
                SafeNote: oODataLog.SafeNote || "",
                GeneralNote: oODataLog.GeneralNote || "",
                ContractorNote: oODataLog.ContractorNote || ""
            };
            oUIModel.setProperty("/selectedLog", oLog);
            oUIModel.setProperty("/ui/isSelected", true);
            oUIModel.setProperty("/ui/editMode", false);
            oUIModel.setProperty("/ui/isNewRecord", false);

            this._loadResourceUse(oODataLog.LogId);
        },

        _loadResourceUse: function (sLogId) {
            var oModel = this.getOwnerComponent().getModel();
            var oUIModel = this.getView().getModel("dailyLogModel");

            oModel.read("/ResourceSet", {
                success: function (oResData) {
                    var mResource = {};
                    (oResData.results || []).forEach(function (r) {
                        mResource[r.ResourceId] = r;
                    });

                    oModel.read("/ResourceUseSet", {
                        filters: sLogId ? [new Filter("LogId", FilterOperator.EQ, sLogId)] : [],
                        success: function (oData) {
                            var mRawItems = oData.results || [];
                            var mGrouped = {};

                            mRawItems.forEach(function (u) {
                                var sResId = (u.ResourceId || "").trim().toUpperCase();
                                if (!sResId) return;

                                var oRes = mResource[sResId] || mResource[u.ResourceId] || {};
                                var flQty = parseFloat(u.Quantity) || 0;

                                if (mGrouped[sResId]) {
                                    mGrouped[sResId].Quantity += flQty;
                                } else {
                                    mGrouped[sResId] = {
                                        ResourceUseId: u.ResourceUseId,
                                        ResourceId: u.ResourceId,
                                        LogId: u.LogId,
                                        WbsId: u.WbsId,
                                        Quantity: flQty,
                                        ResourceName: oRes.ResourceName || u.ResourceId,
                                        ResourceType: oRes.ResourceType || "",
                                        UnitCode: oRes.UnitCode || ""
                                    };
                                }
                            });

                            var aCleanList = Object.keys(mGrouped).map(function (k) { return mGrouped[k]; });
                            oUIModel.setProperty("/resourceUseList", aCleanList);
                        },
                        error: function () {
                            oUIModel.setProperty("/resourceUseList", []);
                        }
                    });
                },
                error: function () {
                    oUIModel.setProperty("/resourceUseList", []);
                }
            });
        },

        _verifyStatusForDailyLog: function (bIsDelete) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return false;

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sStatus = oCtx.getProperty("Status");
            var aAllowed = ["IN_PROGRESS", "CLOSE_REJECTED"];

            if (aAllowed.indexOf(sStatus) === -1) {
                var sStatusText = this.formatWbsStatusText(sStatus);
                var sActionText = bIsDelete ? oBundle.getText("verifyStatusActionDelete") : oBundle.getText("verifyStatusActionWrite");
                var sAllowedText = "'In Progress' hoặc 'Close Rejected'";

                MessageBox.warning(
                    oBundle.getText("verifyStatusError", [sActionText, sStatusText, sAllowedText])
                );
                return false;
            }
            return true;
        },

        onAddLog: function () {
            // Permission check: ZBT_DAILY_LOG — only AuthLevel 0 (Field Engineer)
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (iAuthLevel !== 0) {
                MessageBox.error(oBundle.getText("dailyLogPermissionError"));
                return;
            }

            if (!this._verifyStatusForDailyLog()) {
                return;
            }

            var oUIModel = this.getView().getModel("dailyLogModel");
            var bEditMode = oUIModel.getProperty("/ui/editMode");

            // Check if there's unsaved data to warn user
            if (bEditMode) {
                var oLog = oUIModel.getProperty("/selectedLog") || {};
                var aResources = oUIModel.getProperty("/resourceUseList") || [];
                var bHasData = (parseFloat(oLog.QuantityDone) > 0) ||
                    (oLog.GeneralNote && oLog.GeneralNote.trim() !== "") ||
                    (oLog.SafeNote && oLog.SafeNote.trim() !== "") ||
                    (oLog.ContractorNote && oLog.ContractorNote.trim() !== "") ||
                    (aResources.length > 0);

                if (bHasData) {
                    MessageBox.confirm(oBundle.getText("dailyLogUnsavedDataConfirm"), {
                        onClose: function (sAction) {
                            if (sAction === MessageBox.Action.OK) {
                                this._proceedToAddLog();
                            }
                        }.bind(this)
                    });
                    return;
                }
            }

            this._proceedToAddLog();
        },

        _proceedToAddLog: function () {
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oTable = this.byId("idDailyLogList");
            if (oTable) {
                oTable.removeSelections(true);
            }
            var oModel = this.getOwnerComponent().getModel();
            var sPath = "/WBSSet(guid'" + this._sWbsId + "')";
            var sWbsUnitCode = oModel.getProperty(sPath + "/UnitCode") || "";
            oUIModel.setProperty("/selectedLog", {
                LogId: "",
                WbsId: this._sWbsId || "",
                LogDate: new Date(),
                WeatherAm: "SUNNY",
                WeatherPm: "SUNNY",
                QuantityDone: 0,
                UnitCode: sWbsUnitCode,
                SafeNote: "",
                GeneralNote: "",
                ContractorNote: ""
            });
            oUIModel.setProperty("/resourceUseList", []);
            oUIModel.setProperty("/ui/isSelected", true);
            oUIModel.setProperty("/ui/editMode", true);
            oUIModel.setProperty("/ui/isNewRecord", true);
            console.log("DailyLogDelegate: onAddLog (Proceed)");
        },

        onExportExcel: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oTable = this.byId("idDailyLogList");
            var aSelectedItems = oTable ? oTable.getSelectedItems() : [];

            if (!aSelectedItems || aSelectedItems.length === 0) {
                MessageToast.show(oBundle.getText("selectLogsForExport"));
                return;
            }

            var aLogs = aSelectedItems.map(function (oItem) {
                var oCtx = oItem.getBindingContext("dailyLogModel");
                if (!oCtx) { return null; }
                var oObj = oCtx.getObject();
                return {
                    LogId: oObj.LogId,
                    LogDate: oObj.LogDate,
                    QuantityDone: oObj.QuantityDone,
                    WeatherAm: oObj.WeatherAm,
                    WeatherPm: oObj.WeatherPm,
                    GeneralNote: oObj.GeneralNote,
                    SafeNote: oObj.SafeNote,
                    ContractorNote: oObj.ContractorNote
                };
            }).filter(Boolean);

            var oModel = this.getOwnerComponent().getModel();
            var aAllResources = [];

            var fnFetchNext = function (iIdx) {
                if (iIdx >= aLogs.length) {
                    var aUniqueIds = [];
                    aAllResources.forEach(function (r) {
                        if (r.ResourceId && aUniqueIds.indexOf(r.ResourceId) === -1) {
                            aUniqueIds.push(r.ResourceId);
                        }
                    });

                    if (aUniqueIds.length === 0) {
                        DailyLogExcelHandler.exportDailyLogs(aLogs, aAllResources, oBundle);
                        return;
                    }

                    var iDone = 0;
                    var oResCache = {};
                    aUniqueIds.forEach(function (sResId) {
                        oModel.read("/ResourceSet('" + sResId + "')", {
                            success: function (oRes) {
                                oResCache[sResId] = {
                                    ResourceName: oRes.ResourceName || "",
                                    ResourceType: oRes.ResourceType || "MATERIAL",
                                    UnitCode: oRes.UnitCode || ""
                                };
                                if (++iDone >= aUniqueIds.length) {
                                    aAllResources.forEach(function (r) {
                                        var oDetail = oResCache[r.ResourceId] || {};
                                        r.ResourceName = oDetail.ResourceName || "";
                                        r.ResourceType = oDetail.ResourceType || "MATERIAL";
                                        r.UnitCode = oDetail.UnitCode || "";
                                    });
                                    DailyLogExcelHandler.exportDailyLogs(aLogs, aAllResources, oBundle);
                                }
                            },
                            error: function () {
                                if (++iDone >= aUniqueIds.length) {
                                    DailyLogExcelHandler.exportDailyLogs(aLogs, aAllResources, oBundle);
                                }
                            }
                        });
                    });
                    return;
                }
                oModel.read("/ResourceUseSet", {
                    filters: [new Filter("LogId", FilterOperator.EQ, aLogs[iIdx].LogId)],
                    success: function (oResData) {
                        aAllResources = aAllResources.concat(oResData.results || []);
                        fnFetchNext(iIdx + 1);
                    },
                    error: function () {
                        fnFetchNext(iIdx + 1);
                    }
                });
            };
            fnFetchNext(0);
        },

        onDownloadTemplate: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            DailyLogExcelHandler.exportDailyLogs([], [], oBundle);
        },

        onImportExcel: function () {
            // Permission check: ZBT_DAILY_LOG — only AuthLevel 0 (Field Engineer)
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (iAuthLevel !== 0) {
                sap.m.MessageBox.error(oBundle.getText("dailyLogPermissionError"));
                return;
            }
            if (!this._verifyStatusForDailyLog()) {
                return;
            }
            var that = this;
            var oFileInput = document.createElement("input");
            oFileInput.type = "file";
            oFileInput.accept = ".xlsx,.xls";
            oFileInput.onchange = function (oEvent) {
                var oFile = oEvent.target.files[0];
                if (!oFile) { return; }

                var oBundle = that.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(oBundle.getText("importingFile", [oFile.name]));

                DailyLogExcelHandler.parseExcelFile(oFile).then(function (oParsed) {
                    try {
                        var aLogs = DailyLogExcelHandler.transformExcelData(
                            oParsed.dailyLogs,
                            oParsed.resourceUses,
                            oParsed.resourceMasters,
                            oBundle
                        );

                        if (!aLogs || aLogs.length === 0) {
                            MessageToast.show(oBundle.getText("noValidDataFound"));
                            return;
                        }
                        that.getView().getModel("importPreviewModel").setProperty("/logs", aLogs);
                        that._openImportPreviewDialog();
                    } catch (eTransform) {
                        MessageBox.error(eTransform.message);
                    }
                }).catch(function (e) {
                    MessageBox.error(oBundle.getText("parseExcelError", [e.message]));
                });
            };
            oFileInput.click();
        },

        _openImportPreviewDialog: function () {
            var oView = this.getView();
            if (!this._pImportPreviewDialog) {
                this._pImportPreviewDialog = sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "z.bts.buildtrack551.view.fragments.ImportPreviewDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pImportPreviewDialog.then(function (oDialog) {
                oDialog.open();
                var oTable = this.byId("importPreviewTable");
                if (oTable) {
                    setTimeout(function () { oTable.selectAll(); }, 50);
                }
            }.bind(this));
        },

        onImportPreviewSelectAll: function () {
            var oTable = this.byId("importPreviewTable");
            if (oTable) { oTable.selectAll(); }
        },

        onImportPreviewDeselectAll: function () {
            var oTable = this.byId("importPreviewTable");
            if (oTable) { oTable.removeSelections(true); }
        },

        onConfirmImport: function () {
            if (!this._verifyStatusForDailyLog()) {
                return;
            }
            var oTable = this.byId("importPreviewTable");
            var aSelectedItems = oTable ? oTable.getSelectedItems() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aSelectedItems.length === 0) {
                MessageToast.show(oBundle.getText("selectLogsToImport"));
                return;
            }

            var aSelectedLogs = aSelectedItems.map(function (oItem) {
                return oItem.getBindingContext("importPreviewModel").getObject();
            });

            // FE Validation: Check if imported log dates are within WBS date range AND Project date range
            var oWbsCtx = this.getView().getBindingContext();
            var oProjectModel = this.getView().getModel("projectModel");

            var sWbsUnit = oWbsCtx ? (oWbsCtx.getProperty("UnitCode") || "") : "";
            if (!sWbsUnit) {
                var sErrMsg = oBundle.getText("wbsMissingUnitError") || "Không thể import nhật ký thi công khi Hạng mục chưa có Đơn vị tính hợp lệ.";
                MessageBox.error(sErrMsg);
                return;
            }

            var dWbsStart = oWbsCtx ? oWbsCtx.getProperty("StartActual") : null;
            var dWbsEnd = oWbsCtx ? oWbsCtx.getProperty("EndDate") : null;
            var dProjStart = oProjectModel ? oProjectModel.getProperty("/StartDate") : null;
            var dProjEnd = oProjectModel ? oProjectModel.getProperty("/EndDate") : null;

            var dStartNorm = null;
            var dEndNorm = null;
            var dProjStartNorm = null;
            var dProjEndNorm = null;
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });

            // Helper to normalize any date input (String, Date object, OData timestamp)
            var fnNormalizeDate = function (vDate) {
                if (!vDate) return null;
                var d = null;
                if (vDate instanceof Date) {
                    d = new Date(vDate.getTime());
                } else if (typeof vDate === "string") {
                    // Try dd/MM/yyyy (common in Excel inputs)
                    if (vDate.indexOf("/") !== -1) {
                        d = oDateFormat.parse(vDate);
                    }
                    // Fallback for OData strings or ISO strings
                    if (!d) {
                        d = new Date(vDate);
                    }
                } else if (typeof vDate === "number") {
                    d = new Date(vDate);
                }

                if (d && !isNaN(d.getTime())) {
                    d.setHours(0, 0, 0, 0);
                    return d;
                }
                return null;
            };

            dStartNorm = fnNormalizeDate(dWbsStart);
            dEndNorm = fnNormalizeDate(dWbsEnd);
            dProjStartNorm = fnNormalizeDate(dProjStart);
            dProjEndNorm = fnNormalizeDate(dProjEnd);

            // Clear all previous row highlights
            var aAllItems = oTable ? oTable.getItems() : [];
            aAllItems.forEach(function (oItem) {
                if (oItem.setHighlight) {
                    oItem.setHighlight("None");
                }
            });

            var bHasInvalidDate = false;
            var aErrorMessages = [];

            for (var i = 0; i < aSelectedItems.length; i++) {
                (function (idx) {
                    var oItemLocal = aSelectedItems[idx];
                    var dLogRaw = aSelectedLogs[idx].log_date;
                    var sDateDisplay = oDateFormat.format(fnNormalizeDate(dLogRaw)) || dLogRaw;

                    var fnMarkError = function (sMsg) {
                        bHasInvalidDate = true;
                        if (oItemLocal && oItemLocal.setHighlight) {
                            oItemLocal.setHighlight("Error");
                        }
                        aErrorMessages.push("Row " + (idx + 1) + " (" + sDateDisplay + "): " + sMsg);
                    };

                    var dLogNorm = fnNormalizeDate(dLogRaw);
                    if (!dLogNorm) {
                        fnMarkError(oBundle.getText("requireWbsStartDate"));
                        return;
                    }

                    var iLogMs = dLogNorm.getTime();

                    // Check WBS logic first (most restrictive)
                    if (dStartNorm && iLogMs < dStartNorm.getTime()) {
                        fnMarkError(oBundle.getText("logDateBeforeWbsStartError", [oDateFormat.format(dStartNorm)]));
                        return;
                    }
                    if (dEndNorm && iLogMs > dEndNorm.getTime()) {
                        fnMarkError(oBundle.getText("logDateAfterWbsEndError", [oDateFormat.format(dEndNorm)]));
                        return;
                    }

                    // Check Project logic second
                    if (dProjStartNorm && iLogMs < dProjStartNorm.getTime()) {
                        fnMarkError(oBundle.getText("logDateBeforeProjectStartError", [oDateFormat.format(dProjStartNorm)]));
                        return;
                    }
                    if (dProjEndNorm && iLogMs > dProjEndNorm.getTime()) {
                        fnMarkError(oBundle.getText("logDateAfterProjectEndError", [oDateFormat.format(dProjEndNorm)]));
                        return;
                    }
                })(i);
            }

            if (bHasInvalidDate) {
                MessageBox.error(aErrorMessages.join("\n"));
                return;
            }

            // Validate resource quantity > 0
            var bHasInvalidQty = false;
            var aQtyErrors = [];
            for (var j = 0; j < aSelectedLogs.length; j++) {
                (function (idx) {
                    var oItemLocal = aSelectedItems[idx];
                    var oLog = aSelectedLogs[idx];
                    var aRes = oLog.resources || [];
                    var sDateDisplay = oDateFormat.format(fnNormalizeDate(oLog.log_date)) || oLog.log_date;

                    for (var r = 0; r < aRes.length; r++) {
                        var fQty = parseFloat(aRes[r].quantity);
                        if (isNaN(fQty) || fQty <= 0) {
                            bHasInvalidQty = true;
                            if (oItemLocal && oItemLocal.setHighlight) {
                                oItemLocal.setHighlight("Error");
                            }
                            aQtyErrors.push("Row " + (idx + 1) + " (" + sDateDisplay + "): " + oBundle.getText("resourceQuantityZeroError") + " [" + (aRes[r].resource_id || "?") + "]");
                            break;
                        }
                    }
                })(j);
            }

            if (bHasInvalidQty) {
                MessageBox.error(aQtyErrors.join("\n"));
                return;
            }

            var fWbsQty = oWbsCtx ? parseFloat(oWbsCtx.getProperty("Quantity")) || 0 : 0;
            var fWbsTotalDone = oWbsCtx ? parseFloat(oWbsCtx.getProperty("TotalQtyDone")) || 0 : 0;
            var fImportTotal = 0;
            aSelectedLogs.forEach(function (l) {
                fImportTotal += parseFloat(l.qty_done) || 0;
            });
            var fProjectedTotal = fWbsTotalDone + fImportTotal;

            var that = this;
            var fnStartImport = function () {
                that.byId("importPreviewDialog").close();
                MessageToast.show(oBundle.getText("importingLogsSequentially", [aSelectedLogs.length]));

                var oModel = that.getOwnerComponent().getModel();
                var oUIModel = that.getView().getModel("dailyLogModel");
                oUIModel.setProperty("/ui/busy", true);

                oModel.read("/DailyLogSet", {
                    filters: that._sWbsId ? [new Filter("WbsId", FilterOperator.EQ, that._sWbsId)] : [],
                    success: function (oData) {
                        var aExistingLogs = oData.results || [];
                        that._importLogsSequentially(aSelectedLogs, 0, 0, aExistingLogs);
                    },
                    error: function () {
                        oUIModel.setProperty("/ui/busy", false);
                        MessageBox.error(oBundle.getText("logDateValidationError"));
                    }
                });
            };

            if (fWbsQty > 0 && fProjectedTotal > fWbsQty) {
                MessageBox.warning("Tổng khối lượng thi công sau khi Import (ước tính ~" + fProjectedTotal.toFixed(2) + ") sẽ vượt quá khối lượng kế hoạch (" + fWbsQty.toFixed(2) + "). Bạn có chắc chắn muốn thêm?", {
                    title: "Cảnh báo vượt khối lượng",
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.YES) {
                            fnStartImport();
                        }
                    }
                });
                return;
            }

            fnStartImport();
        },

        onCancelImport: function () {
            this.byId("importPreviewDialog").close();
        },

        onImportLogDateChange: function (oEvent) {
            var oDatePicker = oEvent.getSource();
            oDatePicker.setValueState("None");
            oDatePicker.setValueStateText("");

            // Clear row highlight
            var oItem = oDatePicker.getParent();
            if (oItem && oItem.setHighlight) {
                oItem.setHighlight("None");
            }

            var dNewDate = oDatePicker.getDateValue();
            if (!dNewDate) {
                return;
            }
            var oCtx = oDatePicker.getBindingContext("importPreviewModel");
            if (oCtx) {
                oCtx.getModel().setProperty(oCtx.getPath() + "/log_date", dNewDate);
            }
        },

        formatImportDate: function (oDate) {
            if (!oDate) return "";
            var d = new Date(oDate);
            return (d.getDate().toString().padStart(2, '0') + "/" +
                (d.getMonth() + 1).toString().padStart(2, '0') + "/" +
                d.getFullYear());
        },

        formatWeather: function (sWeather) {
            if (!sWeather) return "";
            var sCode = sWeather.toUpperCase();
            var sKey = "sunny";
            if (sCode === "RAINY") sKey = "rainy";
            else if (sCode === "COOL") sKey = "cool";
            else if (sCode === "STORM") sKey = "storm";
            else if (sCode === "CLOUDY") sKey = "cloudy";
            var oBndl = this.getView().getModel("i18n").getResourceBundle();
            return oBndl.getText(sKey);
        },

        formatImportPreviewLogCount: function (sText, iLength) {
            if (!sText) return "";
            return sText.replace("{0}", iLength || 0);
        },

        formatTotalResQty: function (aResources) {
            if (!aResources || !Array.isArray(aResources) || aResources.length === 0) return "0";
            var fTotal = 0;
            aResources.forEach(function (res) {
                fTotal += parseFloat(res.quantity) || 0;
            });
            return String(Math.round(fTotal));
        },

        _importLogsSequentially: function (aLogs, iIndex, iSuccess, aExistingLogs, aCreatedDates, aUpdatedDates) {
            var that = this;
            var oUIModel = this.getView().getModel("dailyLogModel");
            aCreatedDates = aCreatedDates || [];
            aUpdatedDates = aUpdatedDates || [];

            var oDateFmt = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });

            if (iIndex >= aLogs.length) {
                oUIModel.setProperty("/ui/busy", false);
                var oBundle = this.getView().getModel("i18n").getResourceBundle();

                // Build detailed result message
                var aLines = [];
                if (aCreatedDates.length > 0) {
                    aLines.push("✅ " + oBundle.getText("importNewLogs", [aCreatedDates.length]) + ":");
                    aCreatedDates.forEach(function (sDate) {
                        aLines.push("   • " + sDate);
                    });
                }
                if (aUpdatedDates.length > 0) {
                    if (aLines.length > 0) aLines.push("");
                    aLines.push("🔄 " + oBundle.getText("importUpdatedLogs", [aUpdatedDates.length]) + ":");
                    aUpdatedDates.forEach(function (sDate) {
                        aLines.push("   • " + sDate);
                    });
                }
                if (aLines.length === 0) {
                    aLines.push(oBundle.getText("logsImportedSuccess", [0]));
                }

                MessageBox.success(aLines.join("\n"), {
                    title: oBundle.getText("logsImportedSuccess", [iSuccess])
                });

                this._bindDailyLogList(this._sWbsId);
                this._updateWbsActualDates(this._sWbsId);
                this._loadWorkSummary(this._sWbsId);
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var oLog = aLogs[iIndex];
            var oWbsCtx = this.getView().getBindingContext();
            var sWbsUnit = oWbsCtx ? (oWbsCtx.getProperty("UnitCode") || "") : "";

            var dLogDate = oLog.log_date instanceof Date ? oLog.log_date : new Date(oLog.log_date);
            var dUtcMidnight = new Date(Date.UTC(dLogDate.getFullYear(), dLogDate.getMonth(), dLogDate.getDate()));
            var sFormattedDate = oDateFmt.format(dLogDate);

            var oPayload = {
                WbsId: this._sWbsId,
                LogDate: dUtcMidnight,
                QuantityDone: oLog.qty_done ? String(parseFloat(oLog.qty_done) || 0) : "0",
                UnitCode: sWbsUnit, // Lấy UnitCode từ WBS gán cho Nhật ký thi công
                WeatherAm: oLog.weather_am || "SUNNY",
                WeatherPm: oLog.weather_pm || "SUNNY",
                GeneralNote: oLog.general_note || "",
                SafeNote: oLog.safe_note || "",
                ContractorNote: oLog.contractor_note || ""
            };

            // CHECK DUPLICATE DATE
            var sExistingLogId = null;
            for (var i = 0; i < aExistingLogs.length; i++) {
                var l = aExistingLogs[i];
                var dExisting = l.LogDate instanceof Date ? l.LogDate : new Date(l.LogDate);
                var sLogWbsId = l.WbsId ? l.WbsId.toLowerCase().replace(/-/g, "") : "";
                var sNormCheckId = this._sWbsId ? this._sWbsId.toLowerCase().replace(/-/g, "") : "";

                if ((!sLogWbsId || sLogWbsId === sNormCheckId) &&
                    dExisting.getFullYear() === dLogDate.getFullYear() &&
                    dExisting.getMonth() === dLogDate.getMonth() &&
                    dExisting.getDate() === dLogDate.getDate()) {
                    sExistingLogId = l.LogId;
                    break;
                }
            }

            var fnAfterLog = function (sLogId) {
                var aRawResources = oLog.resources || [];

                // Group duplicates from Excel by ResourceId
                var mGrouped = {};
                aRawResources.forEach(function (res) {
                    var sResId = (res.resource_id || "").toUpperCase().trim();
                    if (!sResId) return;
                    var flQty = parseFloat(res.quantity) || 0;
                    if (mGrouped[sResId]) {
                        mGrouped[sResId] += flQty;
                    } else {
                        mGrouped[sResId] = flQty;
                    }
                });

                var aResources = Object.keys(mGrouped).map(function (sResId) {
                    return {
                        ResourceId: sResId,
                        Quantity: mGrouped[sResId]
                    };
                });

                if (aResources.length === 0) {
                    that._importLogsSequentially(aLogs, iIndex + 1, iSuccess + 1, aExistingLogs, aCreatedDates, aUpdatedDates);
                    return;
                }

                // Re-use _saveResourceUse which handles sequential processing (avoids batch changeset error)
                // and correctly handles updates by replacing existing resources instead of appending.
                that._saveResourceUse(sLogId, aResources, function () {
                    that._importLogsSequentially(aLogs, iIndex + 1, iSuccess + 1, aExistingLogs, aCreatedDates, aUpdatedDates);
                });
            };

            if (sExistingLogId) {
                // UPDATE existing log
                oModel.update("/DailyLogSet(guid'" + sExistingLogId + "')", oPayload, {
                    success: function () {
                        aUpdatedDates.push(sFormattedDate);
                        fnAfterLog(sExistingLogId);
                    },
                    error: function () {
                        that._importLogsSequentially(aLogs, iIndex + 1, iSuccess, aExistingLogs, aCreatedDates, aUpdatedDates);
                    }
                });
            } else {
                // CREATE new log
                oModel.create("/DailyLogSet", oPayload, {
                    success: function (oCreated) {
                        var sNewLogId = oCreated.LogId;
                        aExistingLogs.push({
                            LogId: sNewLogId,
                            LogDate: dUtcMidnight,
                            WbsId: oCreated.WbsId
                        });
                        aCreatedDates.push(sFormattedDate);
                        fnAfterLog(sNewLogId);
                    },
                    error: function () {
                        that._importLogsSequentially(aLogs, iIndex + 1, iSuccess, aExistingLogs, aCreatedDates, aUpdatedDates);
                    }
                });
            }
        },

        onDeleteLog: function () {
            // Permission check: ZBT_DAILY_LOG — only AuthLevel 0 (Field Engineer)
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (iAuthLevel !== 0) {
                sap.m.MessageBox.error(oBundle.getText("dailyLogPermissionError"));
                return;
            }
            if (!this._verifyStatusForDailyLog(true)) {
                return;
            }
            var that = this;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oUIModel = this.getView().getModel("dailyLogModel");
            var sLogId = oUIModel.getProperty("/selectedLog/LogId");

            if (!sLogId || sLogId === "00000000-0000-0000-0000-000000000000") {
                MessageToast.show(oBundle.getText("selectLogToViewDetail"));
                return;
            }

            MessageBox.confirm(oBundle.getText("deleteLogConfirm"), {
                title: oBundle.getText("deleteLogTitle"),
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    var oModel = that.getOwnerComponent().getModel();
                    oModel.remove("/DailyLogSet(guid'" + sLogId + "')", {
                        success: function () {
                            oUIModel.setProperty("/ui/isSelected", false);
                            oUIModel.setProperty("/selectedLog", null);
                            that._bindDailyLogList(that._sWbsId);
                            that._updateWbsActualDates(that._sWbsId);
                            that._loadWorkSummary(that._sWbsId);
                            var oTable = that.byId("idDailyLogList");
                            if (oTable) {
                                oTable.removeSelections(true);
                                oUIModel.setProperty("/ui/selectedLogsCount", 0);
                            }
                            MessageToast.show(oBundle.getText("logDeletedSuccess"));
                        },
                        error: function (oError) {
                            MessageBox.error(DailyLogDelegate._parseError(oError, oBundle.getText("deleteLogError")));
                        }
                    });
                }
            });
        },

        onDeleteMultipleLogs: function () {
            // Permission check: ZBT_DAILY_LOG — only AuthLevel 0 (Field Engineer)
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (iAuthLevel !== 0) {
                sap.m.MessageBox.error(oBundle.getText("dailyLogPermissionError"));
                return;
            }
            if (!this._verifyStatusForDailyLog(true)) {
                return;
            }
            var that = this;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oTable = this.byId("idDailyLogList");
            var aSelectedItems = oTable.getSelectedItems();

            if (!aSelectedItems || aSelectedItems.length === 0) {
                MessageToast.show(oBundle.getText("noLogsSelected"));
                return;
            }

            MessageBox.confirm(oBundle.getText("deleteMultipleLogsConfirm", [aSelectedItems.length]), {
                title: oBundle.getText("deleteMultipleLogsTitle"),
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    var oModel = that.getOwnerComponent().getModel();
                    var oUIModel = that.getView().getModel("dailyLogModel");
                    oUIModel.setProperty("/ui/busy", true);

                    var iTotal = aSelectedItems.length;
                    var iDone = 0;
                    var iSuccess = 0;

                    var fnDeleteSeq = function (iIndex) {
                        if (iIndex >= iTotal) {
                            oUIModel.setProperty("/ui/busy", false);
                            oUIModel.setProperty("/ui/isSelected", false);
                            oUIModel.setProperty("/selectedLog", null);
                            oTable.removeSelections(true);
                            oUIModel.setProperty("/ui/selectedLogsCount", 0);

                            that._bindDailyLogList(that._sWbsId);
                            that._updateWbsActualDates(that._sWbsId);
                            that._loadWorkSummary(that._sWbsId);
                            MessageToast.show(oBundle.getText("deleteMultipleLogsResult", [iSuccess, iTotal]));
                            return;
                        }

                        var oItem = aSelectedItems[iIndex];
                        var oCtx = oItem.getBindingContext("dailyLogModel");
                        if (!oCtx) {
                            iDone++;
                            fnDeleteSeq(iIndex + 1);
                            return;
                        }

                        var sLogId = oCtx.getProperty("LogId");
                        if (!sLogId || sLogId === "undefined" || sLogId === "") {
                            iDone++;
                            fnDeleteSeq(iIndex + 1);
                            return;
                        }

                        oModel.remove("/DailyLogSet(guid'" + sLogId + "')", {
                            success: function () {
                                iSuccess++;
                                iDone++;
                                fnDeleteSeq(iIndex + 1);
                            },
                            error: function () {
                                iDone++;
                                fnDeleteSeq(iIndex + 1);
                            }
                        });
                    };

                    // Start sequential deletion
                    fnDeleteSeq(0);
                }
            });
        },

        onToggleEditMode: function () {
            // Permission check: ZBT_DAILY_LOG — only AuthLevel 0 (Field Engineer)
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (iAuthLevel !== 0) {
                sap.m.MessageBox.error(oBundle.getText("dailyLogPermissionError"));
                return;
            }

            if (!this._verifyStatusForDailyLog()) {
                return;
            }
            var oInput = this.byId("inQuantityDone");
            if (oInput) {
                oInput.setValueState("None");
            }
            // Save a deep copy of current data as backup for Cancel
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oCurrentLog = oUIModel.getProperty("/selectedLog");
            var aCurrentResources = oUIModel.getProperty("/resourceUseList");
            oUIModel.setProperty("/ui/_backupLog", JSON.parse(JSON.stringify(oCurrentLog || {})));
            oUIModel.setProperty("/ui/_backupResources", JSON.parse(JSON.stringify(aCurrentResources || [])));
            oUIModel.setProperty("/ui/editMode", true);
        },

        onQuantityChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oEvent.getParameter("newValue");
            // Only allow digits (integers)
            var sNumeric = sValue.replace(/[^\d]/g, "");

            if (sValue !== sNumeric) {
                oInput.setValue(sNumeric);
            }

            oInput.setValueState("None");
            oInput.setValueStateText("");
        },

        onCancelEdit: function () {
            var oUIModel = this.getView().getModel("dailyLogModel");
            var bIsNew = oUIModel.getProperty("/ui/isNewRecord");
            if (bIsNew) {
                oUIModel.setProperty("/ui/isSelected", false);
                oUIModel.setProperty("/selectedLog", null);
                var oTable = this.byId("idDailyLogList");
                if (oTable) {
                    oTable.removeSelections(true);
                }
            } else {
                // Restore from backup saved when entering edit mode
                var oBackupLog = oUIModel.getProperty("/ui/_backupLog");
                var aBackupResources = oUIModel.getProperty("/ui/_backupResources");
                if (oBackupLog) {
                    // Restore LogDate as a Date object (JSON.parse converts it to string)
                    if (oBackupLog.LogDate && typeof oBackupLog.LogDate === "string") {
                        oBackupLog.LogDate = new Date(oBackupLog.LogDate);
                    }
                    oUIModel.setProperty("/selectedLog", oBackupLog);
                }
                if (aBackupResources) {
                    oUIModel.setProperty("/resourceUseList", aBackupResources);
                }
                oUIModel.setProperty("/ui/editMode", false);
            }
        },

        onAddResourceUse: function () {
            var oUIModel = this.getView().getModel("dailyLogModel");
            var aList = oUIModel.getProperty("/resourceUseList") || [];
            aList = aList.concat([{
                ResourceUseId: "",
                LogId: oUIModel.getProperty("/selectedLog/LogId") || "",
                WbsId: oUIModel.getProperty("/selectedLog/WbsId") || "",
                ResourceId: "",
                ResourceName: "",
                ResourceType: "",
                UnitCode: "",
                Quantity: 1
            }]);
            oUIModel.setProperty("/resourceUseList", aList);
        },

        onDeleteResourceUse: function (oEvent) {
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oCtx = oEvent.getParameter("listItem").getBindingContext("dailyLogModel");
            var idx = parseInt(oCtx.getPath().split("/").pop(), 10);
            var aList = oUIModel.getProperty("/resourceUseList").slice();
            aList.splice(idx, 1);
            oUIModel.setProperty("/resourceUseList", aList);
        },

        _getResourceApiModel: function () {
            if (!this._oResourceApiModel) {
                this._oResourceApiModel = new sap.ui.model.odata.v2.ODataModel(
                    "/sap/opu/odata/sap/ZC_BT_RESOURCE_CDS/",
                    {
                        useBatch: false,
                        defaultCountMode: "None"
                    }
                );
            }
            return this._oResourceApiModel;
        },

        _normalizeResourceMaster: function (oRaw) {
            if (!oRaw) { return null; }

            var fnPick = function (aCandidates) {
                for (var i = 0; i < aCandidates.length; i++) {
                    var v = aCandidates[i];
                    if (v !== undefined && v !== null && String(v).trim() !== "") {
                        return String(v).trim();
                    }
                }
                return "";
            };

            var sResourceId = fnPick([oRaw.ResourceId, oRaw.resource_id, oRaw.RESOURCE_ID, oRaw.resourceId]);
            if (!sResourceId) { return null; }

            return {
                ResourceId: sResourceId,
                ResourceName: fnPick([oRaw.ResourceName, oRaw.resource_name, oRaw.RESOURCE_NAME, oRaw.resourceName]),
                ResourceType: fnPick([oRaw.ResourceType, oRaw.resource_type, oRaw.RESOURCE_TYPE, oRaw.resourceType]).toUpperCase(),
                UnitCode: fnPick([oRaw.UnitCode, oRaw.unit_code, oRaw.UNIT_CODE, oRaw.unitCode])
            };
        },

        _readResourceMasterList: function (fnSuccess, fnError) {
            var that = this;

            var fnNormalizeList = function (aRaw) {
                var mSeen = {};
                var aOut = [];

                (aRaw || []).forEach(function (oItem) {
                    var oNormalized = that._normalizeResourceMaster(oItem);
                    if (!oNormalized || !oNormalized.ResourceId) { return; }

                    var sDedupKey = oNormalized.ResourceId.toUpperCase();
                    if (mSeen[sDedupKey]) { return; }

                    mSeen[sDedupKey] = true;
                    aOut.push(oNormalized);
                });

                aOut.sort(function (a, b) {
                    return a.ResourceId.localeCompare(b.ResourceId);
                });

                return aOut;
            };

            var fnReadFallback = function () {
                that.getOwnerComponent().getModel().read("/ResourceSet", {
                    success: function (oData) {
                        fnSuccess(fnNormalizeList(oData.results || []));
                    },
                    error: function (oError) {
                        if (fnError) {
                            fnError(oError);
                        }
                    }
                });
            };

            this._getResourceApiModel().read("/ZC_BT_RESOURCE", {
                success: function (oData) {
                    var aItems = fnNormalizeList(oData.results || []);
                    if (aItems.length > 0) {
                        fnSuccess(aItems);
                        return;
                    }

                    fnReadFallback();
                },
                error: function () {
                    fnReadFallback();
                }
            });
        },

        _filterResourceValueHelpItems: function (aItems, mFilter) {
            var sId = (mFilter.id || "").toLowerCase().trim();
            var sName = (mFilter.name || "").toLowerCase().trim();
            var sType = (mFilter.type || "").toLowerCase().trim();
            var sUnit = (mFilter.unit || "").toLowerCase().trim();

            return (aItems || []).filter(function (oItem) {
                var bIdOk = !sId || (oItem.ResourceId || "").toLowerCase().indexOf(sId) !== -1;
                var bNameOk = !sName || (oItem.ResourceName || "").toLowerCase().indexOf(sName) !== -1;
                var bTypeOk = !sType || (oItem.ResourceType || "").toLowerCase().indexOf(sType) !== -1;
                var bUnitOk = !sUnit || (oItem.UnitCode || "").toLowerCase().indexOf(sUnit) !== -1;

                return bIdOk && bNameOk && bTypeOk && bUnitOk;
            });
        },

        _applyResourceInfoToRow: function (sRowPath, oResource) {
            var oUIModel = this.getView().getModel("dailyLogModel");
            oUIModel.setProperty(sRowPath + "/ResourceId", oResource.ResourceId || "");
            oUIModel.setProperty(sRowPath + "/ResourceName", oResource.ResourceName || "");
            oUIModel.setProperty(sRowPath + "/ResourceType", oResource.ResourceType || "");
            oUIModel.setProperty(sRowPath + "/UnitCode", oResource.UnitCode || "");
        },

        _applyAndMergeResourceInfo: function (sRowPath, oPicked, oInputControl) {
            if (!oPicked) return;

            var currentIndex = parseInt(sRowPath.split("/").pop(), 10);
            var oUIModel = this.getView().getModel("dailyLogModel");
            var aList = oUIModel.getProperty("/resourceUseList") || [];
            var mergedIndex = -1;

            // Check if resource already exists in other rows
            for (var j = 0; j < aList.length; j++) {
                if (j !== currentIndex && (aList[j].ResourceId || "").toUpperCase() === oPicked.ResourceId.toUpperCase()) {
                    mergedIndex = j;
                    break;
                }
            }

            if (mergedIndex !== -1) {
                // Merge quantities automatically
                var currentQty = parseFloat(aList[currentIndex].Quantity) || 1;
                var existingQty = parseFloat(aList[mergedIndex].Quantity) || 0;
                aList[mergedIndex].Quantity = existingQty + currentQty;

                // Remove duplicate row
                aList.splice(currentIndex, 1);

                // Force fresh array reference to guarantee UI5 update
                oUIModel.setProperty("/resourceUseList", aList.slice());
                oUIModel.refresh(true);

                sap.m.MessageToast.show("Phát hiện tài nguyên đã tồn tại. Đã tự động gộp số lượng!");
                return;
            }

            this._applyResourceInfoToRow(sRowPath, oPicked);
            if (oInputControl) {
                oInputControl.setValue(oPicked.ResourceId);
                oInputControl.setValueState("None");
                oInputControl.setValueStateText("");
            }
        },

        _openResourceIdValueHelp: function (sRowPath, oInputControl) {
            var that = this;
            var oView = this.getView();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (oView) {
                oView.setBusyIndicatorDelay(0);
                oView.setBusy(true);
            }

            var fnReleaseBusy = function () {
                if (oView) {
                    oView.setBusy(false);
                }
            };

            this._readResourceMasterList(function (aItems) {
                var aAllItems = aItems || [];
                var oTableModel = new JSONModel(aAllItems.slice());

                var oResourceIdFilter = new Input({ placeholder: oBundle.getText("enterKeyword") });
                var oResourceNameFilter = new Input({ placeholder: oBundle.getText("enterKeyword") });
                var oResourceTypeFilter = new Input({ placeholder: oBundle.getText("enterKeyword") });
                var oUnitFilter = new Input({ placeholder: oBundle.getText("enterKeyword") });

                var oDialog = new ValueHelpDialog({
                    title: oBundle.getText("resourceCode"),
                    key: "ResourceId",
                    descriptionKey: "ResourceName",
                    supportMultiselect: false,
                    supportRanges: false,
                    ok: function (oEvent) {
                        var aTokens = oEvent.getParameter("tokens") || [];
                        if (aTokens.length > 0) {
                            var sPickedId = aTokens[0].getKey();
                            var oPicked = null;

                            for (var i = 0; i < aAllItems.length; i++) {
                                if (aAllItems[i].ResourceId === sPickedId) {
                                    oPicked = aAllItems[i];
                                    break;
                                }
                            }

                            if (oPicked) {
                                that._applyAndMergeResourceInfo(sRowPath, oPicked, oInputControl);
                            }
                        }

                        oDialog.close();
                    },
                    cancel: function () {
                        oDialog.close();
                    },
                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                var fnApplyFilters = function () {
                    oTableModel.setData(that._filterResourceValueHelpItems(aAllItems, {
                        id: oResourceIdFilter.getValue(),
                        name: oResourceNameFilter.getValue(),
                        type: oResourceTypeFilter.getValue(),
                        unit: oUnitFilter.getValue()
                    }));
                    oDialog.update();
                };

                var oFilterBar = new FilterBar({
                    useToolbar: true,
                    showGoOnFB: true,
                    search: fnApplyFilters
                });

                oFilterBar.addFilterGroupItem(new FilterGroupItem({
                    groupName: "Basic",
                    name: "ResourceId",
                    label: oBundle.getText("resourceCode"),
                    visibleInFilterBar: true,
                    control: oResourceIdFilter
                }));
                oFilterBar.addFilterGroupItem(new FilterGroupItem({
                    groupName: "Basic",
                    name: "ResourceName",
                    label: oBundle.getText("resourceName"),
                    visibleInFilterBar: true,
                    control: oResourceNameFilter
                }));
                oFilterBar.addFilterGroupItem(new FilterGroupItem({
                    groupName: "Basic",
                    name: "ResourceType",
                    label: oBundle.getText("resourceType"),
                    visibleInFilterBar: true,
                    control: oResourceTypeFilter
                }));
                oFilterBar.addFilterGroupItem(new FilterGroupItem({
                    groupName: "Basic",
                    name: "UnitCode",
                    label: oBundle.getText("resourceUnit"),
                    visibleInFilterBar: true,
                    control: oUnitFilter
                }));

                oDialog.setFilterBar(oFilterBar);

                var sCurrentId = oInputControl ? (oInputControl.getValue() || "").trim() : "";
                if (sCurrentId) {
                    oDialog.setTokens([
                        new Token({ key: sCurrentId, text: sCurrentId })
                    ]);
                }

                oDialog.getTableAsync().then(function (oTable) {
                    oTable.setModel(oTableModel);

                    if (oTable.bindRows) {
                        oTable.addColumn(new sap.ui.table.Column({ label: new Label({ text: oBundle.getText("resourceCode") }), template: new Text({ text: "{ResourceId}" }) }));
                        oTable.addColumn(new sap.ui.table.Column({ label: new Label({ text: oBundle.getText("resourceName") }), template: new Text({ text: "{ResourceName}" }) }));
                        oTable.addColumn(new sap.ui.table.Column({ label: new Label({ text: oBundle.getText("resourceType") }), template: new Text({ text: "{ResourceType}" }) }));
                        oTable.addColumn(new sap.ui.table.Column({ label: new Label({ text: oBundle.getText("resourceUnit") }), template: new Text({ text: "{UnitCode}" }) }));
                        oTable.bindRows("/");
                    } else {
                        oTable.addColumn(new Column({ header: new Label({ text: oBundle.getText("resourceCode") }) }));
                        oTable.addColumn(new Column({ header: new Label({ text: oBundle.getText("resourceName") }) }));
                        oTable.addColumn(new Column({ header: new Label({ text: oBundle.getText("resourceType") }) }));
                        oTable.addColumn(new Column({ header: new Label({ text: oBundle.getText("resourceUnit") }) }));

                        oTable.bindItems("/", new ColumnListItem({
                            cells: [
                                new Text({ text: "{ResourceId}" }),
                                new Text({ text: "{ResourceName}" }),
                                new Text({ text: "{ResourceType}" }),
                                new Text({ text: "{UnitCode}" })
                            ]
                        }));
                    }

                    oDialog.update();
                    fnReleaseBusy();
                }).catch(function () {
                    fnReleaseBusy();
                });

                oDialog.open();
            }, function () {
                fnReleaseBusy();
                MessageBox.error(oBundle.getText("selectResourceError"));
            });
        },

        onResourceIdValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            var oCtx = oInput.getBindingContext("dailyLogModel");
            if (!oCtx) { return; }

            this._openResourceIdValueHelp(oCtx.getPath(), oInput);
        },

        onResourceIdChange: function (oEvent) {
            var that = this;
            var oInput = oEvent.getSource();
            var oCtx = oInput.getBindingContext("dailyLogModel");
            if (!oCtx) { return; }

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sRawResourceId = (oInput.getValue() || "").trim();

            oInput.setValueState("None");
            oInput.setValueStateText("");

            if (!sRawResourceId) {
                this._applyResourceInfoToRow(oCtx.getPath(), {
                    ResourceId: "",
                    ResourceName: "",
                    ResourceType: "",
                    UnitCode: ""
                });
                return;
            }

            this._readResourceMasterList(function (aItems) {
                var sNeedle = sRawResourceId.toUpperCase();
                var oPicked = null;

                for (var i = 0; i < aItems.length; i++) {
                    if ((aItems[i].ResourceId || "").toUpperCase() === sNeedle) {
                        oPicked = aItems[i];
                        break;
                    }
                }

                if (oPicked) {
                    that._applyAndMergeResourceInfo(oCtx.getPath(), oPicked, oInput);
                    return;
                }

                that._applyResourceInfoToRow(oCtx.getPath(), {
                    ResourceId: sRawResourceId,
                    ResourceName: "",
                    ResourceType: "",
                    UnitCode: ""
                });

                oInput.setValueState("Error");
                oInput.setValueStateText(oBundle.getText("selectResourceError"));
            }, function () {
                oInput.setValueState("Error");
                oInput.setValueStateText(oBundle.getText("selectResourceError"));
            });
        },

        onResourceQtyChange: function (oEvent) {
            var oStepInput = oEvent.getSource();
            var fValue = parseFloat(oStepInput.getValue());
            if (isNaN(fValue) || fValue <= 0) {
                oStepInput.setValueState("Error");
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                oStepInput.setValueStateText(oBundle.getText("resourceQuantityZeroError"));
            } else {
                oStepInput.setValueState("None");
                oStepInput.setValueStateText("");
            }
        },

        onSaveLog: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oLog = oUIModel.getProperty("/selectedLog");
            var oInput = this.byId("inQuantityDone");
            var oDatePicker = this.byId("inLogDate");

            if (oInput) {
                oInput.setValueState("None");
            }
            if (oDatePicker) {
                oDatePicker.setValueState("None");
            }

            // 0. Validate Report Date within WBS date range
            var dLogDate = oLog.LogDate instanceof Date ? oLog.LogDate : new Date(oLog.LogDate);
            if (!dLogDate || isNaN(dLogDate.getTime())) {
                if (oDatePicker) {
                    oDatePicker.setValueState("Error");
                    oDatePicker.setValueStateText(oBundle.getText("requireWbsStartDate"));
                }
                return;
            }

            var oWbsCtx = this.getView().getBindingContext();
            var oProjectModel = this.getView().getModel("projectModel");

            // Normalize log date to midnight for comparison
            var dLogNorm = new Date(dLogDate); dLogNorm.setHours(0, 0, 0, 0);

            // Project date validation bounds
            if (oProjectModel) {
                var dProjStart = oProjectModel.getProperty("/StartDate");
                var dProjEnd = oProjectModel.getProperty("/EndDate");

                if (dProjStart) {
                    var dProjStartNorm = new Date(dProjStart instanceof Date ? dProjStart : new Date(dProjStart));
                    dProjStartNorm.setHours(0, 0, 0, 0);
                    if (dLogNorm < dProjStartNorm) {
                        if (oDatePicker) {
                            var oDateFormatP1 = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                            oDatePicker.setValueState("Error");
                            oDatePicker.setValueStateText(oBundle.getText("logDateBeforeProjectStartError", [oDateFormatP1.format(dProjStartNorm)]));
                        }
                        return;
                    }
                }
                if (dProjEnd) {
                    var dProjEndNorm = new Date(dProjEnd instanceof Date ? dProjEnd : new Date(dProjEnd));
                    dProjEndNorm.setHours(0, 0, 0, 0);
                    if (dLogNorm > dProjEndNorm) {
                        if (oDatePicker) {
                            var oDateFormatP2 = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                            oDatePicker.setValueState("Error");
                            oDatePicker.setValueStateText(oBundle.getText("logDateAfterProjectEndError", [oDateFormatP2.format(dProjEndNorm)]));
                        }
                        return;
                    }
                }
            }

            // WBS date validation bounds
            if (oWbsCtx) {
                var dWbsStart = oWbsCtx.getProperty("StartActual");
                var dWbsEnd = oWbsCtx.getProperty("EndDate");

                if (dWbsStart) {
                    var dStartNorm = new Date(dWbsStart instanceof Date ? dWbsStart : new Date(dWbsStart));
                    dStartNorm.setHours(0, 0, 0, 0);
                    if (dLogNorm < dStartNorm) {
                        if (oDatePicker) {
                            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                            oDatePicker.setValueState("Error");
                            oDatePicker.setValueStateText(oBundle.getText("logDateBeforeWbsStartError", [oDateFormat.format(dStartNorm)]));
                        }
                        return;
                    }
                }

                if (dWbsEnd) {
                    var dEndNorm = new Date(dWbsEnd instanceof Date ? dWbsEnd : new Date(dWbsEnd));
                    dEndNorm.setHours(0, 0, 0, 0);
                    if (dLogNorm > dEndNorm) {
                        if (oDatePicker) {
                            var oDateFormat2 = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                            oDatePicker.setValueState("Error");
                            oDatePicker.setValueStateText(oBundle.getText("logDateAfterWbsEndError", [oDateFormat2.format(dEndNorm)]));
                        }
                        return;
                    }
                }
            }

            // 1. Validate Quantity > 0
            var fQty = parseFloat(oLog.QuantityDone) || 0;
            if (fQty <= 0) {
                if (oInput) {
                    oInput.setValueState("Error");
                    oInput.setValueStateText(oBundle.getText("wbsQuantityZeroError"));
                }
                return;
            }

            // 2. Validate Resource Usage (Must have at least one and none missing ResourceId, Qty > 0)
            var aResources = oUIModel.getProperty("/resourceUseList") || [];
            var oTable = this.byId("idResourceUseTable");
            var aItems = oTable ? oTable.getItems() : [];

            var bMissingResourceInfo = false;
            var bInvalidResourceQty = false;

            if (aResources.length === 0) {
                MessageBox.error(oBundle.getText("selectResourceError"));
                return;
            }

            aItems.forEach(function (oItem) {
                var aCells = oItem.getCells();
                // CELL 1 contains a VBox -> Input (index 0)
                var oCodeInput = aCells[0].getItems()[0];
                // CELL 4 contains StepInput
                var oStepInput = aCells[3];

                var oRowCtx = oItem.getBindingContext("dailyLogModel");
                var oRowData = oRowCtx ? (oRowCtx.getObject() || {}) : {};

                var sResourceId = String(oRowData.ResourceId || "").trim();
                if (!sResourceId) {
                    bMissingResourceInfo = true;
                    if (oCodeInput) {
                        oCodeInput.setValueState("Error");
                        oCodeInput.setValueStateText(oBundle.getText("selectResourceError"));
                    }
                }

                var fResQty = parseFloat(oStepInput.getValue());
                if (isNaN(fResQty) || fResQty <= 0) {
                    bInvalidResourceQty = true;
                    oStepInput.setValueState("Error");
                    oStepInput.setValueStateText(oBundle.getText("resourceQuantityZeroError"));
                }
            });

            if (bMissingResourceInfo || bInvalidResourceQty) {
                return;
            }

            var fWbsQty = oWbsCtx ? parseFloat(oWbsCtx.getProperty("Quantity")) || 0 : 0;
            var fWbsTotalDone = oWbsCtx ? parseFloat(oWbsCtx.getProperty("TotalQtyDone")) || 0 : 0;
            var bIsNew = oUIModel.getProperty("/ui/isNewRecord");
            var fOldQty = 0;
            if (!bIsNew && oLog.LogId) {
                var aList = oUIModel.getProperty("/list") || [];
                var oOrig = aList.find(function (l) { return l.LogId === oLog.LogId; });
                if (oOrig) fOldQty = parseFloat(oOrig.QuantityDone) || 0;
            }
            var fProjectedTotal = fWbsTotalDone - fOldQty + fQty;

            var that = this;
            if (fWbsQty > 0 && fProjectedTotal > fWbsQty) {
                sap.m.MessageBox.warning("Tổng khối lượng thi công (" + fProjectedTotal.toFixed(2) + ") sẽ vượt quá khối lượng kế hoạch (" + fWbsQty.toFixed(2) + "). Bạn có chắc chắn muốn tiếp tục lưu?", {
                    title: "Cảnh báo vượt khối lượng",
                    actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
                    onClose: function (sAction) {
                        if (sAction === sap.m.MessageBox.Action.YES) {
                            that._persistLog(oBundle.getText("dailyLogSaveSuccess"));
                        }
                    }
                });
                return;
            }

            this._persistLog(oBundle.getText("dailyLogSaveSuccess"));
        },

        _persistLog: function (sToast) {
            var that = this;
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oLog = oUIModel.getProperty("/selectedLog");
            var aResourceUse = oUIModel.getProperty("/resourceUseList") || [];
            var oModel = this.getOwnerComponent().getModel();
            var bIsNew = oUIModel.getProperty("/ui/isNewRecord");

            if (!oLog) { return; }

            var dRaw = oLog.LogDate instanceof Date ? oLog.LogDate : new Date(oLog.LogDate);
            var dUtcMidnight = new Date(Date.UTC(dRaw.getFullYear(), dRaw.getMonth(), dRaw.getDate()));
            var oPayload = {
                WbsId: oLog.WbsId || "",
                LogDate: dUtcMidnight,
                WeatherAm: oLog.WeatherAm || "SUNNY",
                WeatherPm: oLog.WeatherPm || "SUNNY",
                QuantityDone: String(parseFloat(oLog.QuantityDone) || 0),
                UnitCode: oLog.UnitCode || "",
                SafeNote: oLog.SafeNote || "",
                GeneralNote: oLog.GeneralNote || "",
                ContractorNote: oLog.ContractorNote || ""
            };

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var fnContinueSave = function () {
                oUIModel.setProperty("/ui/busy", true);
                var fnAfterLog = function (sLogId) {
                    // LAST DEFENSE: Group duplicates before saving to OData
                    var mGrouped = {};
                    aResourceUse.forEach(function (res) {
                        var sResId = (res.ResourceId || "").trim().toUpperCase();
                        if (!sResId) return;
                        var flQty = parseFloat(res.Quantity) || 0;
                        if (mGrouped[sResId]) {
                            mGrouped[sResId].Quantity += flQty;
                        } else {
                            mGrouped[sResId] = {
                                ResourceId: sResId,
                                Quantity: flQty
                            };
                        }
                    });
                    var aCleanResourceUse = Object.keys(mGrouped).map(function (k) { return mGrouped[k]; });

                    that._saveResourceUse(sLogId, aCleanResourceUse, function () {
                        oUIModel.setProperty("/ui/busy", false);
                        oUIModel.setProperty("/ui/editMode", false);
                        oUIModel.setProperty("/ui/isNewRecord", false);
                        oUIModel.setProperty("/selectedLog/LogId", sLogId);
                        that._bindDailyLogList(that._sWbsId);
                        that._updateWbsActualDates(that._sWbsId);
                        that._loadWorkSummary(that._sWbsId);
                        that._loadResourceUse(sLogId);

                        MessageToast.show(sToast);
                    });
                };

                if (bIsNew) {
                    oModel.create("/DailyLogSet", oPayload, {
                        success: function (oCreated) {
                            fnAfterLog(oCreated.LogId);
                        },
                        error: function (oError) {
                            oUIModel.setProperty("/ui/busy", false);
                            MessageBox.error(that._parseError(oError, oBundle.getText("dailyLogSaveError")));
                        }
                    });
                } else {
                    oModel.update("/DailyLogSet(guid'" + oLog.LogId + "')", oPayload, {
                        success: function () {
                            fnAfterLog(oLog.LogId);
                        },
                        error: function (oError) {
                            oUIModel.setProperty("/ui/busy", false);
                            MessageBox.error(that._parseError(oError, oBundle.getText("dailyLogSaveError")));
                        }
                    });
                }
            };

            // Validate duplicate date before saving
            oUIModel.setProperty("/ui/busy", true);
            oModel.read("/DailyLogSet", {
                filters: oLog.WbsId ? [new Filter("WbsId", FilterOperator.EQ, oLog.WbsId)] : [],
                success: function (oData) {
                    oUIModel.setProperty("/ui/busy", false);
                    var sExistingLogIdToUpdate = null;
                    var sNormCheckId = oLog.WbsId ? oLog.WbsId.toLowerCase().replace(/-/g, "") : "";
                    // Client-side filter: backend có thể ignore $filter
                    var aLogs = (oData.results || []).filter(function (l) {
                        var sLogId = l.WbsId ? l.WbsId.toLowerCase().replace(/-/g, "") : "";
                        return !sLogId || sLogId === sNormCheckId;
                    });
                    for (var i = 0; i < aLogs.length; i++) {
                        if (!bIsNew && aLogs[i].LogId === oLog.LogId) {
                            continue;
                        }
                        var dExisting = aLogs[i].LogDate instanceof Date ? aLogs[i].LogDate : new Date(aLogs[i].LogDate);
                        if (dExisting.getFullYear() === dRaw.getFullYear() &&
                            dExisting.getMonth() === dRaw.getMonth() &&
                            dExisting.getDate() === dRaw.getDate()) {
                            sExistingLogIdToUpdate = aLogs[i].LogId;
                            break;
                        }
                    }

                    if (sExistingLogIdToUpdate) {
                        // Duplicate date found — ask user to confirm overwrite
                        var oDateFmt = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                        var sDateStr = oDateFmt.format(dRaw);
                        MessageBox.confirm(oBundle.getText("duplicateLogDateOverwriteConfirm", [sDateStr]), {
                            title: oBundle.getText("duplicateLogDateOverwriteTitle"),
                            onClose: function (sAction) {
                                if (sAction === MessageBox.Action.OK) {
                                    // Switch to update mode for this existing log
                                    bIsNew = false;
                                    oLog.LogId = sExistingLogIdToUpdate;
                                    fnContinueSave();
                                }
                            }
                        });
                        return;
                    }

                    fnContinueSave();
                },
                error: function (oError) {
                    oUIModel.setProperty("/ui/busy", false);
                    MessageBox.error(DailyLogDelegate._parseError(oError, oBundle.getText("logDateValidationError")));
                }
            });
        },

        _saveResourceUse: function (sLogId, aResUse, fnSuccess) {
            var oModel = this.getOwnerComponent().getModel();

            var fnSequentialProcess = function (aOld, aNew) {
                console.log("_saveResourceUse: Deleting " + aOld.length + " old resources, creating " + aNew.length + " new resources for LogId=" + sLogId);
                var iOldIdx = 0;
                var fnProcessOld = function () {
                    if (iOldIdx >= aOld.length) {
                        fnProcessNew();
                        return;
                    }
                    var u = aOld[iOldIdx++];
                    console.log("_saveResourceUse: Removing ResourceUseId=" + u.ResourceUseId);
                    oModel.remove("/ResourceUseSet(guid'" + u.ResourceUseId + "')", {
                        success: fnProcessOld,
                        error: function () {
                            console.warn("_saveResourceUse: Failed to remove ResourceUseId=" + u.ResourceUseId);
                            fnProcessOld();
                        }
                    });
                };

                var iNewIdx = 0;
                var fnProcessNew = function () {
                    if (iNewIdx >= aNew.length) {
                        fnSuccess();
                        return;
                    }
                    var u = aNew[iNewIdx++];
                    var oPayload = {
                        ResourceId: u.ResourceId,
                        LogId: sLogId,
                        Quantity: String(parseFloat(u.Quantity) || 0)
                    };
                    oModel.create("/ResourceUseSet", oPayload, {
                        success: fnProcessNew,
                        error: fnProcessNew
                    });
                };

                fnProcessOld();
            };

            // Read existing resources for this log — use filter, but also do client-side filtering
            // as a safety net in case the backend ignores $filter
            oModel.read("/ResourceUseSet", {
                filters: [new Filter("LogId", FilterOperator.EQ, sLogId)],
                success: function (oData) {
                    var aAll = oData.results || [];
                    // Client-side filter: only keep resources belonging to this LogId
                    var sNormLogId = (sLogId || "").toLowerCase().replace(/-/g, "");
                    var aFiltered = aAll.filter(function (r) {
                        var sResLogId = (r.LogId || "").toLowerCase().replace(/-/g, "");
                        return sResLogId === sNormLogId;
                    });
                    console.log("_saveResourceUse: Backend returned " + aAll.length + " resources, after client filter: " + aFiltered.length);
                    fnSequentialProcess(aFiltered, aResUse);
                },
                error: function () {
                    console.warn("_saveResourceUse: Failed to read existing resources, proceeding with create only");
                    fnSequentialProcess([], aResUse);
                }
            });
        },

        _updateWbsActualDates: function (sWbsId) {
            // StartActual được cập nhật ở backend (khi Run WBS / Update Status).
            // EndActual lấy max(LogDate) của tất cả DailyLog thuộc WBS này.
            var oModel = this.getOwnerComponent().getModel();
            var oView = this.getView();
            var oBundle = oView.getModel("i18n").getResourceBundle();
            var oBinding = oView.getElementBinding();

            oModel.read("/DailyLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    var aLogs = oData.results || [];
                    if (aLogs.length === 0) {
                        if (oBinding) { oBinding.refresh(true); }
                        return;
                    }

                    // Tìm ngày mới nhất (max)
                    var maxDate = aLogs.reduce(function (max, log) {
                        var dLog = new Date(log.LogDate);
                        var dMax = new Date(max);
                        return (dLog > dMax) ? log.LogDate : max;
                    }, aLogs[0].LogDate);

                    // Giữ phần time offset cho OData V2
                    maxDate = new Date(maxDate);
                    maxDate.setMinutes(maxDate.getMinutes() - maxDate.getTimezoneOffset());

                    // Chỉ xuất sự kiện để báo cho SiteDetail (biểu đồ Gantt) tự fetch lại data và tính toán local
                    // Thông báo toàn cục lý do: Biểu đồ Gantt ở các trang khác cần tính toán lại dữ liệu
                    sap.ui.getCore().getEventBus().publish("Global", "RefreshData");

                    if (oBinding) {
                        oBinding.refresh(true);
                    }
                },
                error: function () {
                    if (oBinding) { oBinding.refresh(true); }
                }
            });
        },

        _parseError: function (oError, sDefaultMsg) {
            var sMsg = sDefaultMsg || "Action failed.";
            try {
                if (oError && oError.responseText) {
                    var oErr = JSON.parse(oError.responseText);
                    if (oErr.error && oErr.error.message && oErr.error.message.value) {
                        sMsg = oErr.error.message.value;
                    } else if (oErr.error && oErr.error.innererror && oErr.error.innererror.errordetails && oErr.error.innererror.errordetails.length > 0) {
                        sMsg = oErr.error.innererror.errordetails[0].message;
                    }
                } else if (oError && oError.message) {
                    sMsg = oError.message;
                }
            } catch (e) {
                // Keep default
            }
            return sMsg;
        },

        onCancelLog: function () {
            this.resetLogDetailState();
        }
    };
});
