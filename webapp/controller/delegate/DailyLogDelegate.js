sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "z/bts/buildtrack551/utils/DailyLogExcelHandler"
], function (JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, DailyLogExcelHandler) {
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
                    var aFilteredLogs = aLogs.filter(function(log) {
                        // Round to integer while we are at it
                        if (log.QuantityDone !== undefined && log.QuantityDone !== null) {
                            log.QuantityDone = Math.round(parseFloat(log.QuantityDone) || 0).toString();
                        }
                        return log.WbsId && log.WbsId.toLowerCase() === sWbsId.toLowerCase();
                    });
                    
                    // Sort descending by LogDate manually
                    aFilteredLogs.sort(function(a, b) {
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

            var parseDate = function(vDate) {
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
            console.log("Showing Log Detail (parsed): ", oLog);
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
                            oUIModel.setProperty("/resourceUseList",
                                (oData.results || []).map(function (u) {
                                    var oRes = mResource[u.ResourceId] || {};
                                    return {
                                        ResourceUseId: u.ResourceUseId,
                                        ResourceId: u.ResourceId,
                                        LogId: u.LogId,
                                        WbsId: u.WbsId,
                                        Quantity: parseFloat(u.Quantity) || 0,
                                        ResourceName: oRes.ResourceName || u.ResourceId,
                                        ResourceType: oRes.ResourceType || "",
                                        UnitCode: oRes.UnitCode || ""
                                    };
                                })
                            );
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
            
            // Allow deletion in PENDING_OPEN for cleanup
            if (bIsDelete) {
                aAllowed.push("PENDING_OPEN");
                aAllowed.push("PLANNING");
                aAllowed.push("OPEN_REJECTED");
            }

            if (aAllowed.indexOf(sStatus) === -1) {
                var sStatusText = this.formatWbsStatusText(sStatus);
                var sActionText = bIsDelete ? oBundle.getText("verifyStatusActionDelete") : oBundle.getText("verifyStatusActionWrite");
                var sAllowedText = bIsDelete ? "'In Progress', 'Close Rejected', 'Pending Open', 'Open Rejected' hoặc 'Planning'" : "'In Progress' hoặc 'Close Rejected'";

                MessageBox.warning(
                    oBundle.getText("verifyStatusError", [sActionText, sStatusText, sAllowedText])
                );
                return false;
            }
            return true;
        },

        onAddLog: function () {
            if (!this._verifyStatusForDailyLog()) {
                return;
            }
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oTable = this.byId("idDailyLogList");
            if (oTable) {
                oTable.removeSelections(true);
            }
            var oWbsContext = this.getView().getBindingContext();
            var sWbsUnitCode = oWbsContext ? oWbsContext.getProperty("UnitCode") : "";

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
                        DailyLogExcelHandler.exportDailyLogs(aLogs, aAllResources);
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
                                    DailyLogExcelHandler.exportDailyLogs(aLogs, aAllResources);
                                }
                            },
                            error: function () {
                                if (++iDone >= aUniqueIds.length) {
                                    DailyLogExcelHandler.exportDailyLogs(aLogs, aAllResources);
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
            DailyLogExcelHandler.exportDailyLogs([], []);
        },

        onImportExcel: function () {
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
                    var aLogs = DailyLogExcelHandler.transformExcelData(
                        oParsed.dailyLogs,
                        oParsed.resourceUses,
                        oParsed.resourceMasters
                    );

                    if (!aLogs || aLogs.length === 0) {
                        MessageToast.show(oBundle.getText("noValidDataFound"));
                        return;
                    }
                    that.getView().getModel("importPreviewModel").setProperty("/logs", aLogs);
                    that._openImportPreviewDialog();
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

            this.byId("importPreviewDialog").close();
            MessageToast.show(oBundle.getText("importingLogsSequentially", [aSelectedLogs.length]));
            this._importLogsSequentially(aSelectedLogs, 0, 0);
        },

        onCancelImport: function () {
            this.byId("importPreviewDialog").close();
        },

        formatImportDate: function (oDate) {
            if (!oDate) return "";
            var d = new Date(oDate);
            return (d.getDate().toString().padStart(2, '0') + "/" +
                (d.getMonth() + 1).toString().padStart(2, '0') + "/" +
                d.getFullYear());
        },

        _importLogsSequentially: function (aLogs, iIndex, iSuccess) {
            var that = this;
            if (iIndex >= aLogs.length) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                MessageToast.show(oBundle.getText("logsImportedSuccess", [iSuccess]));
                this._bindDailyLogList(this._sWbsId);
                this._updateWbsActualDates(this._sWbsId);
                this._loadWorkSummary(this._sWbsId);
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var oLog = aLogs[iIndex];
            var oWbsCtx = this.getView().getBindingContext();
            var sWbsUnit = oWbsCtx ? (oWbsCtx.getProperty("UnitCode") || "") : "";

            var oPayload = {
                WbsId: this._sWbsId,
                LogDate: oLog.log_date || new Date(),
                QuantityDone: oLog.qty_done ? oLog.qty_done.toString() : "0",
                UnitCode: sWbsUnit,
                WeatherAm: oLog.weather_am || "SUNNY",
                WeatherPm: oLog.weather_pm || "SUNNY",
                GeneralNote: oLog.general_note || "",
                SafeNote: oLog.safe_note || "",
                ContractorNote: oLog.contractor_note || ""
            };

            oModel.create("/DailyLogSet", oPayload, {
                success: function (oCreated) {
                    var sNewLogId = oCreated.LogId;
                    var aResources = oLog.resources || [];
                    if (aResources.length === 0) {
                        that._importLogsSequentially(aLogs, iIndex + 1, iSuccess + 1);
                        return;
                    }

                    var iDone = 0;
                    var iTotal = aResources.length;
                    aResources.forEach(function (res) {
                        var oResPayload = {
                            LogId: sNewLogId,
                            ResourceId: res.resource_id || "",
                            Quantity: String(parseFloat(res.quantity) || 0)
                        };
                        oModel.create("/ResourceUseSet", oResPayload, {
                            success: function () {
                                if (++iDone >= iTotal) {
                                    that._importLogsSequentially(aLogs, iIndex + 1, iSuccess + 1);
                                }
                            },
                            error: function () {
                                if (++iDone >= iTotal) {
                                    that._importLogsSequentially(aLogs, iIndex + 1, iSuccess + 1);
                                }
                            }
                        });
                    });
                },
                error: function () {
                    that._importLogsSequentially(aLogs, iIndex + 1, iSuccess);
                }
            });
        },

        onDeleteLog: function () {
            if (!this._verifyStatusForDailyLog(true)) {
                return;
            }
            var that = this;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oUIModel = this.getView().getModel("dailyLogModel");
            var sLogId = oUIModel.getProperty("/selectedLog/LogId");

            if (!sLogId) {
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
                        var oCtx = oItem.getBindingContext();
                        if (!oCtx) {
                            iDone++;
                            fnDeleteSeq(iIndex + 1);
                            return;
                        }

                        var sLogId = oCtx.getProperty("LogId");
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
            if (!this._verifyStatusForDailyLog()) {
                return;
            }
            this.getView().getModel("dailyLogModel").setProperty("/ui/editMode", true);
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

        onResourceIdChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) { return; }
            var sResourceId = oSelectedItem.getKey();
            var oCtx = oEvent.getSource().getBindingContext("dailyLogModel");
            var oUIModel = this.getView().getModel("dailyLogModel");

            var oODataModel = this.getOwnerComponent().getModel();
            oODataModel.read("/ResourceSet('" + sResourceId + "')", {
                success: function (oRes) {
                    oUIModel.setProperty(oCtx.getPath() + "/ResourceId", oRes.ResourceId);
                    oUIModel.setProperty(oCtx.getPath() + "/ResourceName", oRes.ResourceName || "");
                    oUIModel.setProperty(oCtx.getPath() + "/ResourceType", oRes.ResourceType || "");
                    oUIModel.setProperty(oCtx.getPath() + "/UnitCode", oRes.UnitCode || "");
                }
            });
        },

        onSaveLog: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
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
                    that._saveResourceUse(sLogId, aResourceUse, function () {
                        oUIModel.setProperty("/ui/busy", false);
                        oUIModel.setProperty("/ui/editMode", false);
                        oUIModel.setProperty("/ui/isNewRecord", false);
                        oUIModel.setProperty("/selectedLog/LogId", sLogId);
                        that._bindDailyLogList(that._sWbsId);
                        that._updateWbsActualDates(that._sWbsId);
                        that._loadWorkSummary(that._sWbsId);
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
                    var bDuplicate = false;
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
                            bDuplicate = true;
                            break;
                        }
                    }

                    if (bDuplicate) {
                        MessageBox.error(oBundle.getText("duplicateLogDateError"));
                    } else {
                        fnContinueSave();
                    }
                },
                error: function (oError) {
                    oUIModel.setProperty("/ui/busy", false);
                    MessageBox.error(DailyLogDelegate._parseError(oError, oBundle.getText("logDateValidationError")));
                }
            });
        },

        _saveResourceUse: function (sLogId, aResUse, fnSuccess) {
            var oModel = this.getOwnerComponent().getModel();

            oModel.read("/ResourceUseSet", {
                filters: [new Filter("LogId", FilterOperator.EQ, sLogId)],
                success: function (oData) {
                    var aOld = oData.results || [];
                    var iTotal = aOld.length + aResUse.length;
                    var iDone = 0;

                    var fnCheck = function () {
                        iDone++;
                        if (iDone >= iTotal) { fnSuccess(); }
                    };

                    if (iTotal === 0) { fnSuccess(); return; }

                    aOld.forEach(function (u) {
                        oModel.remove("/ResourceUseSet(guid'" + u.ResourceUseId + "')", {
                            success: fnCheck,
                            error: fnCheck
                        });
                    });

                    aResUse.forEach(function (u) {
                        var oPayload = {
                            ResourceId: u.ResourceId,
                            LogId: sLogId,
                            Quantity: String(parseFloat(u.Quantity) || 0)
                        };
                        oModel.create("/ResourceUseSet", oPayload, {
                            success: fnCheck,
                            error: fnCheck
                        });
                    });
                },
                error: function () {
                    var iTotal = aResUse.length;
                    var iDone = 0;
                    if (iTotal === 0) { fnSuccess(); return; }
                    aResUse.forEach(function (u) {
                        var oPayload = {
                            ResourceId: u.ResourceId,
                            LogId: sLogId,
                            Quantity: String(parseFloat(u.Quantity) || 0)
                        };
                        oModel.create("/ResourceUseSet", oPayload, {
                            success: function () { if (++iDone >= iTotal) { fnSuccess(); } },
                            error: function () { if (++iDone >= iTotal) { fnSuccess(); } }
                        });
                    });
                }
            });
        },

        _updateWbsActualDates: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oView = this.getView();

            oModel.read("/DailyLogSet", {
                filters: sWbsId ? [new Filter("WbsId", FilterOperator.EQ, sWbsId)] : [],
                success: function (oData) {
                    var aLogs = oData.results || [];
                    var oUpdate = {};

                    if (aLogs.length > 0) {
                        var aDates = aLogs.map(function (l) {
                            return l.LogDate instanceof Date ? l.LogDate : new Date(l.LogDate);
                        });
                        var dMin = aDates.reduce(function (a, b) { return a < b ? a : b; });
                        var dMax = aDates.reduce(function (a, b) { return a > b ? a : b; });
                        oUpdate.StartActual = dMin;
                        oUpdate.EndActual = dMax;
                    } else {
                        oUpdate.StartActual = null;
                        oUpdate.EndActual = null;
                    }

                    oModel.update("/WBSSet(guid'" + sWbsId + "')", oUpdate, {
                        success: function () {
                            console.log("WBS actual dates updated: ", oUpdate.StartActual, "→", oUpdate.EndActual);
                            var oBinding = oView.getElementBinding();
                            if (oBinding) { oBinding.refresh(); }
                        },
                        error: function (oErr) {
                            console.error("Failed to update WBS actual dates:", oErr);
                        }
                    });
                },
                error: function (oErr) {
                    console.error("Failed to read DailyLogs for actual date calc:", oErr);
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
        }
    };
});
