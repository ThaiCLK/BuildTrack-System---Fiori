sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "z/bts/buildtrack/utils/DailyLogExcelHandler"
], function (Controller, History, MessageBox, MessageToast, JSONModel, Filter, FilterOperator, Sorter, DailyLogExcelHandler) {
    "use strict";



    return Controller.extend("z.bts.buildtrack.controller.WBSDetail", {

        /* =========================================================== */
        /* LIFECYCLE                                                    */
        /* =========================================================== */

        onInit: function () {
            // Route matching
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("WBSDetail").attachPatternMatched(this._onObjectMatched, this);

            // Local UI-state model — no mock data
            var oUIModel = new JSONModel({
                selectedLog: null,
                resourceUseList: [],
                ui: {
                    isSelected: false,
                    editMode: false,
                    isNewRecord: false,
                    busy: false
                }
            });
            oUIModel.setDefaultBindingMode("TwoWay");
            this.getView().setModel(oUIModel, "dailyLogModel");

            // Location model for WBS location info
            var oLocationModel = new JSONModel({});
            this.getView().setModel(oLocationModel, "locationModel");

            // Work Summary model
            var oWSModel = new JSONModel({});
            this.getView().setModel(oWSModel, "workSummaryModel");

            // Import Preview model
            var oImportPreviewModel = new JSONModel({
                logs: []
            });
            this.getView().setModel(oImportPreviewModel, "importPreviewModel");
        },

        /* =========================================================== */
        /* ROUTING                                                      */
        /* =========================================================== */

        _onObjectMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            var sWbsId = oArgs.wbsId;
            var sSiteId = oArgs.site_id;
            this._sWbsId = sWbsId;
            this._sSiteId = sSiteId;   // remember for onNavBack

            // Bind the WBS detail form — WbsId is Edm.Guid so use guid'' syntax
            var sObjectPath = "/WBSSet(guid'" + sWbsId + "')";
            this.getView().bindElement({
                path: sObjectPath,
                events: {
                    dataRequested: function () { this.getView().setBusy(true); }.bind(this),
                    dataReceived: function () { this.getView().setBusy(false); }.bind(this)
                }
            });

            // Bind daily log list
            this._bindDailyLogList(sWbsId);

            // Load location info
            this._loadLocation(sWbsId);

            // Load Work Summary info
            this._loadWorkSummary(sWbsId);

            // Reset detail panel
            var oUIModel = this.getView().getModel("dailyLogModel");
            oUIModel.setProperty("/ui/isSelected", false);
            oUIModel.setProperty("/ui/editMode", false);
            oUIModel.setProperty("/selectedLog", null);
        },

        /**
         * Bind (or re-filter) the Log list table for the current WBS.
         * On first call: full bindItems with template from XML aggregation.
         * On subsequent calls: just update filter + sorter on existing binding.
         */
        _bindDailyLogList: function (sWbsId) {
            var oTable = this.byId("idDailyLogList");
            if (!oTable) { return; }

            var oFilter = new Filter("WbsId", FilterOperator.EQ, sWbsId);
            var oSorter = new Sorter("LogDate", false);

            // Always unbind and rebind to ensure the list is fresh
            oTable.unbindAggregation("items");

            // Build template programmatically
            var oTemplate = new sap.m.ColumnListItem({
                type: "Active",
                cells: [
                    new sap.m.Text({
                        text: {
                            path: "LogDate",
                            type: "sap.ui.model.type.Date",
                            formatOptions: { pattern: "dd/MM/yyyy" }
                        }
                    }),
                    new sap.m.ObjectNumber({
                        number: "{QuantityDone}",
                        unit: "{UnitCode}",
                        state: "None"
                    })
                ]
            });

            oTable.bindItems({
                path: "/DailyLogSet",
                filters: [oFilter],
                sorter: oSorter,
                template: oTemplate,
                templateShareable: false
            });
        },

        /**
         * Load the single location record for a WBS.
         */
        _loadLocation: function (sWbsId) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oLocationModel = this.getView().getModel("locationModel");

            // Reset
            oLocationModel.setData({});

            oModel.read("/LocationSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        oLocationModel.setData(oData.results[0]);
                    }
                },
                error: function () {
                    // No location data — form stays hidden
                }
            });
        },

        /**
         * Load the work summary record for a WBS.
         * TotalQuantityDone is aggregated by the backend — FE just GETs it.
         */
        _loadWorkSummary: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oWSModel = this.getView().getModel("workSummaryModel");

            oWSModel.setData({});

            oModel.read("/WorkSummarySet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        var fTotalQty = 0;
                        oData.results.forEach(function (res) {
                            fTotalQty += parseFloat(res.TotalQtyDone) || 0;
                        });

                        var oSummaryData = oData.results[0]; // Use first element as a base for other fields like Status
                        oSummaryData.TotalQtyDone = fTotalQty.toString();
                        oWSModel.setData(oSummaryData);
                    } else {
                        oWSModel.setData({ TotalQtyDone: "0", Status: "" }); // Empty status if no logs
                    }
                },
                error: function () {
                    console.error("Failed to load WorkSummary for WBS:", sWbsId);
                }
            });
        },

        onNavBack: function () {
            // Always navigate explicitly back to SiteDetail using the known site_id.
            // Using window.history.go(-1) is unreliable because OData operations
            // (element-binding refresh, batch calls) can inject extra browser-history
            // entries, causing the user to overshoot past the SiteDetail page.
            if (this._sSiteId) {
                this.getOwnerComponent().getRouter().navTo("SiteDetail", {
                    site_id: this._sSiteId
                }, true);
            } else {
                // Fallback: SAP router history or root
                var sPrev = History.getInstance().getPreviousHash();
                if (sPrev !== undefined) {
                    window.history.go(-1);
                } else {
                    this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
                }
            }
        },

        /* =========================================================== */
        /* Formatter Methods for Work Summary                          */
        /* =========================================================== */

        formatPercentage: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return "0.0%";
            }
            return ((fActual / fTarget) * 100).toFixed(1) + "%";
        },

        formatProgress: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return 0;
            }
            return (fActual / fTarget) * 100;
        },

        formatQuantityState: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return "Warning";
            }
            return fActual >= fTarget ? "Success" : "Warning";
        },

        formatProgressDisplay: function (sActual, sTarget, sUnit) {
            var fActual = parseFloat(sActual) || 0;
            var fTarget = parseFloat(sTarget) || 0;
            var sU = sUnit ? " " + sUnit : "";
            return fActual + " / " + fTarget + sU;
        },

        formatTotalQty: function (sActual) {
            if (sActual === undefined || sActual === null || sActual === "") {
                return "0";
            }
            var fActual = parseFloat(sActual);
            if (isNaN(fActual)) return "0";
            return sActual.toString(); // Keep original string with decimals if provided
        },

        formatWorkSummaryStatusState: function (sStatus) {
            switch (sStatus) {
                case "DRAFT":
                case "DRAFTED": return "None";
                case "SUBMITTED": return "Information";
                case "APPROVED": return "Success";
                case "REJECTED": return "Error";
                default: return "None";
            }
        },

        formatWorkSummaryStatusIcon: function (sStatus) {
            switch (sStatus) {
                case "DRAFT":
                case "DRAFTED": return "sap-icon://document";
                case "SUBMITTED": return "sap-icon://paper-plane";
                case "APPROVED": return "sap-icon://accept";
                case "REJECTED": return "sap-icon://decline";
                default: return "sap-icon://sys-help";
            }
        },

        /* =========================================================== */
        /* DAILY LOG — LIST PANEL                                       */
        /* =========================================================== */

        /** Select a log entry from the list → load detail on right */
        onLogItemSelect: function (oEvent) {
            var oTable = oEvent.getSource();
            var aSelectedItems = oTable.getSelectedItems();
            this.getView().getModel("dailyLogModel").setProperty("/ui/selectedLogsCount", aSelectedItems.length);

            // If user clicked a specific row, display its details on the right
            var oParams = oEvent.getParameters();
            if (oParams && oParams.listItem) {
                var oCtx = oParams.listItem.getBindingContext();
                this._showLogDetail(oCtx);
            } else if (aSelectedItems.length > 0) {
                // If selection changed but no specific listItem clicked (e.g. Select All), show the first selected
                var oFirstCtx = aSelectedItems[0].getBindingContext();
                this._showLogDetail(oFirstCtx);
            } else {
                // No items selected, hide detail
                this.getView().getModel("dailyLogModel").setProperty("/ui/isSelected", false);
                this.getView().getModel("dailyLogModel").setProperty("/selectedLog", null);
            }
        },

        /** Called when user clicks directly on a row (not the checkbox) */
        onLogRowPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            this._showLogDetail(oCtx);
        },

        /** Shared logic: populate the right panel with the selected log */
        _showLogDetail: function (oCtx) {
            var oODataLog = oCtx.getObject();
            var oUIModel = this.getView().getModel("dailyLogModel");

            // Deep-copy OData record into selectedLog for local editing
            var oLog = {
                LogId: oODataLog.LogId,
                WbsId: oODataLog.WbsId,
                LogDate: oODataLog.LogDate,
                WeatherAm: oODataLog.WeatherAm || "SUNNY",
                WeatherPm: oODataLog.WeatherPm || "SUNNY",
                QuantityDone: oODataLog.QuantityDone || 0,
                UnitCode: oODataLog.UnitCode || "",
                SafeNote: oODataLog.SafeNote || "",
                GeneralNote: oODataLog.GeneralNote || "",
                ContractorNote: oODataLog.ContractorNote || ""
            };
            oUIModel.setProperty("/selectedLog", oLog);
            oUIModel.setProperty("/ui/isSelected", true);
            oUIModel.setProperty("/ui/editMode", false);
            oUIModel.setProperty("/ui/isNewRecord", false);

            // Load linked resource usages from OData
            this._loadResourceUse(oODataLog.LogId);
        },

        /**
         * Load resource usage items for a given log via OData (ZBT_RESOURCE_USE).
         * Joins with ResourceSet client-side to obtain name/type/unit.
         */
        _loadResourceUse: function (sLogId) {
            var oModel = this.getOwnerComponent().getModel();
            var oUIModel = this.getView().getModel("dailyLogModel");

            // Read resource master into a map first, then read usages
            oModel.read("/ResourceSet", {
                success: function (oResData) {
                    var mResource = {};
                    (oResData.results || []).forEach(function (r) {
                        mResource[r.ResourceId] = r;
                    });

                    oModel.read("/ResourceUseSet", {
                        filters: [new Filter("LogId", FilterOperator.EQ, sLogId)],
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

        /** Open a blank form to create a new log entry */
        onAddLog: function () {
            var oUIModel = this.getView().getModel("dailyLogModel");

            // Clear list selection to ensure clicking the same item again triggers selectionChange
            var oTable = this.byId("idDailyLogList");
            if (oTable) {
                oTable.removeSelections(true);
            }

            // Get WBS UnitCode from the header context (passed from Dashboard)
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

        /** Export checked daily log(s) to Excel */
        onExportExcel: function () {
            var oTable = this.byId("idDailyLogList");
            var aSelectedItems = oTable ? oTable.getSelectedItems() : [];

            if (!aSelectedItems || aSelectedItems.length === 0) {
                MessageToast.show("Please select at least one log entry first.");
                return;
            }

            // Build array of log objects from each selected OData context
            var aLogs = aSelectedItems.map(function (oItem) {
                var oObj = oItem.getBindingContext().getObject();
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
            });

            var oModel = this.getOwnerComponent().getModel();
            var aAllResources = [];

            // Read ResourceUseSet per LogId, then enrich with ResourceSet details
            var fnFetchNext = function (iIdx) {
                if (iIdx >= aLogs.length) {
                    // Enrich: fetch ResourceSet for each unique ResourceId so that
                    // ResourceName, ResourceType, UnitCode appear in the Resource Master sheet
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
                    var oResCache = {}; // { ResourceId: { Name, Type, Unit } }
                    aUniqueIds.forEach(function (sResId) {
                        oModel.read("/ResourceSet('" + sResId + "')", {
                            success: function (oRes) {
                                oResCache[sResId] = {
                                    ResourceName: oRes.ResourceName || "",
                                    ResourceType: oRes.ResourceType || "MATERIAL",
                                    UnitCode: oRes.UnitCode || ""
                                };
                                if (++iDone >= aUniqueIds.length) {
                                    // Patch all resource-use records with the fetched details
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

        /** Download a blank Excel template for importing Daily Logs */
        onDownloadTemplate: function () {
            DailyLogExcelHandler.exportDailyLogs([], []);
        },

        /** Open a hidden file input to pick an Excel file, then import */
        onImportExcel: function () {
            var that = this;
            // Create and trigger a file input
            var oFileInput = document.createElement("input");
            oFileInput.type = "file";
            oFileInput.accept = ".xlsx,.xls";
            oFileInput.onchange = function (oEvent) {
                var oFile = oEvent.target.files[0];
                if (!oFile) { return; }

                MessageToast.show("Importing " + oFile.name + "...");

                DailyLogExcelHandler.parseExcelFile(oFile).then(function (oParsed) {
                    var aLogs = DailyLogExcelHandler.transformExcelData(
                        oParsed.dailyLogs,
                        oParsed.resourceUses,
                        oParsed.resourceMasters
                    );

                    if (!aLogs || aLogs.length === 0) {
                        MessageToast.show("No valid data found in the file.");
                        return;
                    }

                    // Open preview dialog instead of importing directly
                    that.getView().getModel("importPreviewModel").setProperty("/logs", aLogs);
                    that._openImportPreviewDialog();
                }).catch(function (e) {
                    MessageBox.error("Failed to parse Excel file: " + e.message);
                });
            };
            oFileInput.click();
        },

        _openImportPreviewDialog: function () {
            var oView = this.getView();
            if (!this._pImportPreviewDialog) {
                this._pImportPreviewDialog = sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "z.bts.buildtrack.view.fragments.ImportPreviewDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pImportPreviewDialog.then(function (oDialog) {
                oDialog.open();
                // Check all items by default when opened
                var oTable = this.byId("importPreviewTable");
                if (oTable) {
                    // Timeout needed so table has time to render new items before selection
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
            var oTable = this.byId("importPreviewTable");
            var aSelectedItems = oTable ? oTable.getSelectedItems() : [];

            if (aSelectedItems.length === 0) {
                MessageToast.show("Please select at least one log to import.");
                return;
            }

            var aSelectedLogs = aSelectedItems.map(function (oItem) {
                return oItem.getBindingContext("importPreviewModel").getObject();
            });

            this.byId("importPreviewDialog").close();
            MessageToast.show("Importing " + aSelectedLogs.length + " selected logs...");
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

        /** Recursively POST each parsed log to OData one-by-one */
        _importLogsSequentially: function (aLogs, iIndex, iSuccess) {
            if (iIndex >= aLogs.length) {
                MessageToast.show(iSuccess + " log(s) imported successfully!");
                this._bindDailyLogList(this._sWbsId);
                // Update WBS actual dates + Work Summary after all logs imported
                this._updateWbsActualDates(this._sWbsId);
                // Trigger WorkSummary aggregation via POST, then reload UI
                var oWSPayload = {
                    WbsId: this._sWbsId,
                    TotalQtyDone: "0.000",
                    Status: "DRAFTED"
                };
                var oModel = this.getOwnerComponent().getModel();
                oModel.create("/WorkSummarySet", oWSPayload, {
                    success: function () {
                        that._loadWorkSummary(that._sWbsId);
                    },
                    error: function (e) {
                        console.error("Warning: Could not trigger WorkSummary update", e);
                        that._loadWorkSummary(that._sWbsId);
                    }
                });
                return;
            }

            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oLog = aLogs[iIndex];

            // Read UnitCode from the WBS context so imported logs have the correct unit
            var oWbsCtx = this.getView().getBindingContext();
            var sWbsUnit = oWbsCtx ? (oWbsCtx.getProperty("UnitCode") || "") : "";

            // Build OData-compatible payload
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

                    // Save each resource row that came from the Excel file
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
                    // Skip failed rows and continue
                    that._importLogsSequentially(aLogs, iIndex + 1, iSuccess);
                }
            });
        },

        /** Delete the currently selected log entry */
        onDeleteLog: function () {
            var that = this;
            var oUIModel = this.getView().getModel("dailyLogModel");
            var sLogId = oUIModel.getProperty("/selectedLog/LogId");

            if (!sLogId) {
                MessageToast.show("No entry selected.");
                return;
            }

            MessageBox.confirm("Are you sure you want to delete this log entry?", {
                title: "Delete Confirmation",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    var oModel = that.getOwnerComponent().getModel();
                    oModel.remove("/DailyLogSet(guid'" + sLogId + "')", {
                        success: function () {
                            oUIModel.setProperty("/ui/isSelected", false);
                            oUIModel.setProperty("/selectedLog", null);
                            that._bindDailyLogList(that._sWbsId);
                            // Recalculate WBS actual dates after deletion
                            that._updateWbsActualDates(that._sWbsId);
                            // Trigger WorkSummary aggregation via POST, then reload UI
                            var oWSPayload = {
                                WbsId: that._sWbsId,
                                TotalQtyDone: "0.000",
                                Status: "DRAFT"
                            };
                            oModel.create("/WorkSummarySet", oWSPayload, {
                                success: function () {
                                    that._loadWorkSummary(that._sWbsId);
                                },
                                error: function (e) {
                                    console.error("Warning: Could not trigger WorkSummary update", e);
                                    that._loadWorkSummary(that._sWbsId);
                                }
                            });
                            MessageToast.show("Log entry deleted.");
                        },
                        error: function () {
                            MessageBox.error("Could not delete the log entry. Please try again.");
                        }
                    });
                }
            });
        },

        /** Delete multiple selected log entries */
        onDeleteMultipleLogs: function () {
            var that = this;
            var oTable = this.byId("idDailyLogList");
            var aSelectedItems = oTable.getSelectedItems();

            if (!aSelectedItems || aSelectedItems.length === 0) {
                MessageToast.show("No logs selected.");
                return;
            }

            MessageBox.confirm("Are you sure you want to delete " + aSelectedItems.length + " selected log(s)?", {
                title: "Confirm Batch Delete",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }

                    var oModel = that.getOwnerComponent().getModel();
                    var oUIModel = that.getView().getModel("dailyLogModel");
                    oUIModel.setProperty("/ui/busy", true);

                    var iTotal = aSelectedItems.length;
                    var iDone = 0;
                    var iSuccess = 0;

                    var fnCheckDone = function () {
                        if (iDone >= iTotal) {
                            oUIModel.setProperty("/ui/busy", false);
                            oUIModel.setProperty("/ui/isSelected", false);
                            oUIModel.setProperty("/selectedLog", null);
                            oTable.removeSelections(true);
                            oUIModel.setProperty("/ui/selectedLogsCount", 0);

                            that._bindDailyLogList(that._sWbsId);
                            that._updateWbsActualDates(that._sWbsId);

                            // Trigger WorkSummary aggregation via POST, then reload UI
                            var oWSPayload = {
                                WbsId: that._sWbsId,
                                TotalQtyDone: "0.000",
                                Status: "DRAFT"
                            };
                            oModel.create("/WorkSummarySet", oWSPayload, {
                                success: function () { that._loadWorkSummary(that._sWbsId); },
                                error: function () { that._loadWorkSummary(that._sWbsId); }
                            });

                            MessageToast.show("Deleted " + iSuccess + " out of " + iTotal + " logs.");
                        }
                    };

                    aSelectedItems.forEach(function (oItem) {
                        var oCtx = oItem.getBindingContext();
                        if (!oCtx) {
                            iDone++; fnCheckDone(); return;
                        }
                        var sLogId = oCtx.getProperty("LogId");
                        oModel.remove("/DailyLogSet(guid'" + sLogId + "')", {
                            success: function () {
                                iSuccess++;
                                iDone++;
                                fnCheckDone();
                            },
                            error: function () {
                                iDone++;
                                fnCheckDone();
                            }
                        });
                    });
                }
            });
        },

        /* =========================================================== */
        /* DAILY LOG — DETAIL PANEL: Edit mode                         */
        /* =========================================================== */

        /** Enable edit mode */
        onToggleEditMode: function () {
            this.getView().getModel("dailyLogModel").setProperty("/ui/editMode", true);
        },

        /** Cancel: discard changes, exit edit mode */
        onCancelEdit: function () {
            var oUIModel = this.getView().getModel("dailyLogModel");
            var bIsNew = oUIModel.getProperty("/ui/isNewRecord");
            if (bIsNew) {
                // Discard the new form entirely
                oUIModel.setProperty("/ui/isSelected", false);
                oUIModel.setProperty("/selectedLog", null);

                // Clear list selection
                var oTable = this.byId("idDailyLogList");
                if (oTable) {
                    oTable.removeSelections(true);
                }
            } else {
                oUIModel.setProperty("/ui/editMode", false);
            }
        },

        /* =========================================================== */
        /* DAILY LOG — RESOURCE USE TABLE                              */
        /* =========================================================== */

        /** Add a new resource usage row */
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

        /** Delete a resource usage row */
        onDeleteResourceUse: function (oEvent) {
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oCtx = oEvent.getParameter("listItem").getBindingContext("dailyLogModel");
            var idx = parseInt(oCtx.getPath().split("/").pop(), 10);
            var aList = oUIModel.getProperty("/resourceUseList").slice();
            aList.splice(idx, 1);
            oUIModel.setProperty("/resourceUseList", aList);
        },

        /** Sync ResourceName/Type/Unit when the Select resource changes */
        onResourceIdChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) { return; }
            var sResourceId = oSelectedItem.getKey();
            var oCtx = oEvent.getSource().getBindingContext("dailyLogModel");
            var oUIModel = this.getView().getModel("dailyLogModel");

            // Look up resource master from OData model
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

        /* =========================================================== */
        /* DAILY LOG — FOOTER ACTIONS                                   */
        /* =========================================================== */

        /** Save log entry directly */
        onSaveLog: function () {
            this._persistLog("Log saved successfully.");
        },

        /* =========================================================== */
        /* INTERNAL — persist log to OData                             */
        /* =========================================================== */

        /**
         * Create or update a DailyLog record via OData, then
         * save/update the linked equipment records.
         * @param {string} sToast    - success toast message
         */
        _persistLog: function (sToast) {
            var that = this;
            var oUIModel = this.getView().getModel("dailyLogModel");
            var oLog = oUIModel.getProperty("/selectedLog");
            var aResourceUse = oUIModel.getProperty("/resourceUseList") || [];
            var oModel = this.getOwnerComponent().getModel();
            var bIsNew = oUIModel.getProperty("/ui/isNewRecord");

            if (!oLog) { return; }

            // Build OData payload — matches ZBT_DAILY_LOG columns
            // Convert LogDate to UTC midnight of the locally-selected day
            // to avoid timezone-shift (e.g. GMT+7 sends 23:00 prev day UTC)
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

            oUIModel.setProperty("/ui/busy", true);

            var fnAfterLog = function (sLogId) {
                // Save resource usage rows
                that._saveResourceUse(sLogId, aResourceUse, function () {
                    oUIModel.setProperty("/ui/busy", false);
                    oUIModel.setProperty("/ui/editMode", false);
                    oUIModel.setProperty("/ui/isNewRecord", false);
                    oUIModel.setProperty("/selectedLog/LogId", sLogId);
                    that._bindDailyLogList(that._sWbsId);
                    // Update WBS actual dates based on all daily logs
                    that._updateWbsActualDates(that._sWbsId);
                    // Refresh Work Summary (trigger BE aggregation via POST, then GET)
                    var oWSPayload = {
                        WbsId: that._sWbsId,
                        TotalQtyDone: oPayload.QuantityDone, // Send the qty from this log, BE aggregates later
                        Status: "DRAFTED"
                    };
                    oModel.create("/WorkSummarySet", oWSPayload, {
                        success: function () {
                            that._loadWorkSummary(that._sWbsId);
                        },
                        error: function (e) {
                            console.error("Warning: Could not trigger WorkSummary update", e);
                            that._loadWorkSummary(that._sWbsId);
                        }
                    });
                    MessageToast.show(sToast);
                });
            };

            if (bIsNew) {
                oModel.create("/DailyLogSet", oPayload, {
                    success: function (oCreated) {
                        fnAfterLog(oCreated.LogId);
                    },
                    error: function () {
                        oUIModel.setProperty("/ui/busy", false);
                        MessageBox.error("Could not save the log entry. Please try again.");
                    }
                });
            } else {
                oModel.update("/DailyLogSet(guid'" + oLog.LogId + "')", oPayload, {
                    success: function () {
                        fnAfterLog(oLog.LogId);
                    },
                    error: function () {
                        oUIModel.setProperty("/ui/busy", false);
                        MessageBox.error("Could not update the log entry. Please try again.");
                    }
                });
            }
        },

        /**
         * Save resource usage list for a log (ZBT_RESOURCE_USE):
         *  - Delete all existing ResourceUse records for the log,
         *  - Then re-create from the current resourceUseList array.
         * @param {string}   sLogId      - GUID of the parent DailyLog
         * @param {Array}    aResUse     - resourceUseList array from UI model
         * @param {function} fnSuccess   - callback when done
         */
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

                    // Delete old records
                    aOld.forEach(function (u) {
                        oModel.remove("/ResourceUseSet(guid'" + u.ResourceUseId + "')", {
                            success: fnCheck,
                            error: fnCheck
                        });
                    });

                    // Create new records
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

        /**
         * Read all DailyLogs for a WBS, compute true min/max LogDate,
         * then update WBS.StartActual and WBS.EndActual accordingly.
         * This makes the Gantt "actual" green bar appear.
         */
        _updateWbsActualDates: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oView = this.getView(); // captured for use in callbacks

            oModel.read("/DailyLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    var aLogs = oData.results || [];
                    var oUpdate = {};

                    if (aLogs.length > 0) {
                        // Compute true min / max across all log dates
                        var aDates = aLogs.map(function (l) {
                            return l.LogDate instanceof Date ? l.LogDate : new Date(l.LogDate);
                        });
                        var dMin = aDates.reduce(function (a, b) { return a < b ? a : b; });
                        var dMax = aDates.reduce(function (a, b) { return a > b ? a : b; });
                        oUpdate.StartActual = dMin;
                        oUpdate.EndActual = dMax;
                    } else {
                        // No logs → clear actual dates
                        oUpdate.StartActual = null;
                        oUpdate.EndActual = null;
                    }

                    // PATCH only the actual-date fields
                    oModel.update("/WBSSet(guid'" + sWbsId + "')", oUpdate, {
                        success: function () {
                            console.log("WBS actual dates updated: ", oUpdate.StartActual, "→", oUpdate.EndActual);
                            // Refresh the view binding so the Information tab shows the new dates
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
        }

    });
});