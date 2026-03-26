sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "z/bts/buildtrack551/controller/delegate/DailyLogDelegate",
    "z/bts/buildtrack551/controller/delegate/WorkSummaryDelegate",
    "z/bts/buildtrack551/controller/delegate/ApprovalLogDelegate"
], function (Controller, History, MessageBox, MessageToast, JSONModel, Filter, FilterOperator, Sorter, DailyLogDelegate, WorkSummaryDelegate, ApprovalLogDelegate) {
    "use strict";


    var WBSDetailController = Controller.extend("z.bts.buildtrack551.controller.WBSDetail", {
 
        formatWbsDetailTitle: function (sWbsName) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText("wbsDetailTitle", [sWbsName || ""]);
        },


        /* =========================================================== */
        /* LIFECYCLE                                                    */
        /* =========================================================== */
        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteMain", {}, true);
            }
        },

        /* =========================================================== */
        /* INLINE EDIT MODE - WBS DETAIL INFO                            */
        /* =========================================================== */
        onEditWbs: function () {
            this.getView().getModel("viewData").setProperty("/editMode", true);
        },

        onCancelWbs: function () {
            this.getView().getModel("viewData").setProperty("/editMode", false);
            // Revert changes for OData model
            var oModel = this.getOwnerComponent().getModel();
            if (oModel.hasPendingChanges()) {
                oModel.resetChanges();
            }
            // Revert location model changes by reloading
            this._loadLocation(this._sWbsId);
        },

        onSaveWbs: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oLocationModel = this.getView().getModel("locationModel");
            var that = this;

            var bHasLocationData = !!oLocationModel.getProperty("/LocationName");
            var sLocationId = oLocationModel.getProperty("/LocationId");
            
            var oPayloadLocation = {
                LocationName: oLocationModel.getProperty("/LocationName") || "",
                LocationCode: oLocationModel.getProperty("/LocationCode") || "",
                LocationType: oLocationModel.getProperty("/LocationType") || "",
                PosStart: oLocationModel.getProperty("/PosStart") ? String(oLocationModel.getProperty("/PosStart")) : "0.00",
                PosEnd: oLocationModel.getProperty("/PosEnd") ? String(oLocationModel.getProperty("/PosEnd")) : "0.00",
                PosTop: oLocationModel.getProperty("/PosTop") ? String(oLocationModel.getProperty("/PosTop")) : "0.00",
                PosBot: oLocationModel.getProperty("/PosBot") ? String(oLocationModel.getProperty("/PosBot")) : "0.00",
                WbsId: this._sWbsId
            };

            // Format coordinates to decimals
            oPayloadLocation.PosStart = that._formatDecimal(oPayloadLocation.PosStart);
            oPayloadLocation.PosEnd = that._formatDecimal(oPayloadLocation.PosEnd);
            oPayloadLocation.PosTop = that._formatDecimal(oPayloadLocation.PosTop);
            oPayloadLocation.PosBot = that._formatDecimal(oPayloadLocation.PosBot);

            var fnSaveLocation = function () {
                if (!bHasLocationData) return Promise.resolve();
                
                return new Promise(function (resolve, reject) {
                    if (sLocationId) {
                        // Update existing
                        oModel.update("/LocationSet(guid'" + sLocationId + "')", oPayloadLocation, {
                            success: resolve,
                            error: reject
                        });
                    } else {
                        // Create new
                        oPayloadLocation.LocationId = "00000000-0000-0000-0000-000000000000";
                        oModel.create("/LocationSet", oPayloadLocation, {
                            success: resolve,
                            error: reject
                        });
                    }
                });
            };

            var bIsEditMode = this.getView().getModel("viewData").getProperty("/editMode");
            
            var fnSaveWbs = function () {
                if (!bIsEditMode) return Promise.resolve();
                return new Promise(function(resolve, reject) {
                    var sPath = "/WBSSet(guid'" + that._sWbsId + "')";
                    
                    var oStartDatePicker = that.byId("inWbsStartDate");
                    var oEndDatePicker = that.byId("inWbsEndDate");
                    
                    var toUTC = function (d) {
                        return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null;
                    };

                    var dStart = oStartDatePicker ? oStartDatePicker.getDateValue() : null;
                    var dEnd = oEndDatePicker ? oEndDatePicker.getDateValue() : null;

                    var oPayloadWbs = {
                        WbsName: that.byId("inWbsName").getValue(),
                        WbsCode: that.byId("inWbsCode").getValue(),
                        Quantity: String(that.byId("inWbsQuantity").getValue() || "0"),
                        UnitCode: oModel.getProperty(sPath + "/UnitCode") || "M",
                        Status: that.byId("inWbsStatus").getSelectedKey(),
                        StartDate: dStart ? toUTC(dStart) : oModel.getProperty(sPath + "/StartDate"),
                        EndDate: dEnd ? toUTC(dEnd) : oModel.getProperty(sPath + "/EndDate"),
                        StartActual: oModel.getProperty(sPath + "/StartActual"),
                        EndActual: oModel.getProperty(sPath + "/EndActual"),
                        SiteId: oModel.getProperty(sPath + "/SiteId"),
                        ParentId: oModel.getProperty(sPath + "/ParentId")
                    };
                    oModel.update(sPath, oPayloadWbs, {
                        success: resolve,
                        error: reject
                    });
                });
            };

            // Trigger Saves sequentially
            if (bIsEditMode) {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                fnSaveWbs().then(function() {
                    return fnSaveLocation();
                }).then(function() {
                    MessageToast.show(oBundle.getText("updateSuccess") || "Update successful");
                    that.getView().getModel("viewData").setProperty("/editMode", false);
                    that._loadLocation(that._sWbsId);
                    if (oModel.hasPendingChanges()) {
                        oModel.resetChanges(); // Clear internal flags
                    }
                    // Force refresh to update display text mappings seamlessly
                    oModel.refresh(true);
                }).catch(function(oError) {
                    MessageBox.error(oBundle.getText("updateError") || "Update failed. Please check the data.");
                    that.getView().getModel("viewData").setProperty("/editMode", false);
                    if (oModel.hasPendingChanges()) {
                        oModel.resetChanges();
                    }
                });
            } else {
                that.getView().getModel("viewData").setProperty("/editMode", false);
            }
        },

        _formatDecimal: function (sValue) {
            if (!sValue) return "0.00";
            var fParsed = parseFloat(sValue);
            return isNaN(fParsed) ? "0.00" : fParsed.toFixed(2);
        },
        onInit: function () {
            // Route matching
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("WBSDetail").attachPatternMatched(this._onObjectMatched, this);

            // Init Delegates
            DailyLogDelegate.init(this);
            WorkSummaryDelegate.init(this);
            ApprovalLogDelegate.init(this);

            // Location model for WBS location info
            var oLocationModel = new JSONModel({});
            this.getView().setModel(oLocationModel, "locationModel");

            // Work Summary model
            var oWSModel = new JSONModel({});
            this.getView().setModel(oWSModel, "workSummaryModel");

            // Project model for parent project info
            var oProjectModel = new JSONModel({});
            this.getView().setModel(oProjectModel, "projectModel");

            // View model for UI state
            var oViewData = new JSONModel({
                isApprovalMode: false,
                userLevel: 0,
                canApproveLevel1: false,
                canApproveLevel2: false,
                canApproveLevel3: false,
                canRejectFromReport: false,
                signStatus: {
                    level1: { text: "[Chờ duyệt]", signed: false },
                    level2: { text: "[Chờ duyệt]", signed: false },
                    level3: { text: "[Chờ duyệt]", signed: false }
                },
                editMode: false
            });
            this.getView().setModel(oViewData, "viewData");

            // --- AUTO REFRESH LOGIC ---
            this._fnFocusHandler = function () {
                if (window.location.hash.indexOf("/WBS/") !== -1 && this._sWbsId) {
                    var oModel = this.getOwnerComponent().getModel();
                    // Explicitly fetch data to bypass refresh() blocks (e.g., pending changes)
                    oModel.read("/WBSSet(guid'" + this._sWbsId + "')", {
                        urlParameters: { "$expand": "ToApprovalLog" },
                        headers: {
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            "Pragma": "no-cache",
                            "Expires": "0"
                        },
                        success: function (oData) {
                            var sPath = "/WBSSet(guid'" + this._sWbsId + "')";
                            var bStatusChanged = oModel.getProperty(sPath + "/Status") !== oData.Status;

                            // Manually run check to ensure buttons appear without relying on view binding events
                            this._checkIfActionable(this._sWbsId, oData.Status);

                            // Force OData V2 model to notify bindings
                            if (bStatusChanged) {
                                oModel.setProperty(sPath + "/Status", oData.Status);
                            }
                            if (oModel.getProperty(sPath + "/Quantity") !== oData.Quantity) {
                                oModel.setProperty(sPath + "/Quantity", oData.Quantity);
                            }

                            if (typeof this._loadWorkSummary === "function") {
                                this._loadWorkSummary(this._sWbsId);
                            }
                            if (typeof this.updateProcessFlow === "function") {
                                this.updateProcessFlow(this._aGlobalLogs || []);
                            }
                        }.bind(this)
                    });
                }
            }.bind(this);
            window.addEventListener("focus", this._fnFocusHandler);
        },

        onExit: function () {
            if (this._fnFocusHandler) {
                window.removeEventListener("focus", this._fnFocusHandler);
            }
            this._stopPolling();
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

            // Reset models immediately to avoid stale data during navigation
            var oWSModel = this.getView().getModel("workSummaryModel");
            if (oWSModel) {
                oWSModel.setData({
                    TotalQtyDone: "0",
                    Children: [],
                    WbsId: sWbsId
                });
            }

            // Reset Tab Selection to Info tab
            var oIconTabBar = this.byId("idIconTabBarWBS");
            if (oIconTabBar) {
                oIconTabBar.setSelectedKey("infoTab");
            }

            // Trigger Work Summary load immediately. 
            // The delegate now handles its own OData metadata fetch to avoid context race conditions.
            this._loadWorkSummary(sWbsId);

            // Bind the WBS detail form — WbsId is Edm.Guid so use guid'' syntax
            var sObjectPath = "/WBSSet(guid'" + sWbsId + "')";
            this.getView().bindElement({
                path: sObjectPath,
                parameters: {
                    expand: "ToApprovalLog"
                },
                events: {
                    dataRequested: function () { this.getView().setBusy(true); }.bind(this),
                    dataReceived: function () {
                        this.getView().setBusy(false);
                        var oCtx = this.getView().getBindingContext();
                        if (oCtx) {
                            this._checkIfActionable(oCtx.getProperty("WbsId"), oCtx.getProperty("Status"));
                            if (typeof this.updateProcessFlow === "function") {
                                this.updateProcessFlow(this._aGlobalLogs || []);
                            }
                        }
                    }.bind(this)
                }
            });

            // Bind daily log list
            this._bindDailyLogList(sWbsId);

            // Bind approval log list
            this._bindApprovalLogList(sWbsId);

            // Load location info
            this._loadLocation(sWbsId);

            // Load project info
            this._loadProjectInfo(sSiteId);

            // Reset daily log detail panel
            var oUIModel = this.getView().getModel("dailyLogModel");
            oUIModel.setProperty("/ui/isSelected", false);
            oUIModel.setProperty("/ui/editMode", false);
            oUIModel.setProperty("/selectedLog", null);

            // Reset approval log detail panel
            var oApprovalModel = this.getView().getModel("approvalModel");
            if (oApprovalModel) {
                oApprovalModel.setProperty("/selectedLog", {});
                oApprovalModel.setProperty("/ui/isSelected", false);
            }

            this._startPolling();
        },

        _startPolling: function () {
            // Background polling removed to prevent aggressive network scanning.
            // Relies on focus handler for data sync.
        },

        _stopPolling: function () {
            if (this._iPollingInterval) {
                clearInterval(this._iPollingInterval);
                this._iPollingInterval = null;
            }
        },

        _checkIfActionable: function (sWbsId, sStatus) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oViewData = this.getView().getModel("viewData");
            oViewData.setProperty("/isActionableWorkSummary", false);

            var sApprovalType = (sStatus && sStatus.indexOf("OPEN") !== -1) ? "OPEN" : "CLOSE";

            // Debounce the call to prevent multiple concurrent requests in the same changeset
            if (this._iActionableTimeout) {
                clearTimeout(this._iActionableTimeout);
            }

            this._iActionableTimeout = setTimeout(function () {
                // Fire async to set actionable state for Work Summary button
                oModel.callFunction("/CheckDecision", {
                    method: "POST",
                    // Use a unique group to avoid changeset merging if possible, though debounce handles time merging
                    groupId: "directCheck_" + new Date().getTime(),
                    urlParameters: {
                        WBS_IDS: sWbsId,
                        ApprovalType: sApprovalType
                    },
                    success: function (oResponse) {
                        var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision);

                        var bActionable = false;
                        var sWorkItemId = "";

                        if (oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
                            bActionable = true;
                            sWorkItemId = oResult.WORKITEM_ID;
                        } else if (oResult == 1 || oResult == "1") {
                            bActionable = true;
                            // Extract Latest WorkItem ID from ToApprovalLog
                            var oWbs = that.getView().getBindingContext().getObject();
                            var aLogs = (oWbs.ToApprovalLog && oWbs.ToApprovalLog.results) ? oWbs.ToApprovalLog.results : [];
                            if (aLogs.length > 0) {
                                aLogs.sort(function (a, b) {
                                    if (a.CreatedTimestamp < b.CreatedTimestamp) return 1;
                                    if (a.CreatedTimestamp > b.CreatedTimestamp) return -1;
                                    return 0;
                                });
                                sWorkItemId = aLogs[0].WorkItemId;
                            }
                        }

                        if (bActionable) {
                            oViewData.setProperty("/isActionableWorkSummary", true);
                            oViewData.setProperty("/activeWorkItemId", sWorkItemId);
                        }
                    },
                    error: function (oErr) {
                        console.warn("CheckDecision (isActionable) skipped parsing: " + sWbsId);
                        // Do not show a generic errorText toast here because it blocks UI visibility for normal operation
                    }
                });
            }, 300);
        },

        /* =========================================================== */
        /* DAILY LOG LOGIC — delegated to DailyLogDelegate              */
        /* =========================================================== */

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
                        // Client-side fallback to handle backend not processing $filter correctly
                        var aMatches = oData.results.filter(function(loc) { return loc.WbsId === sWbsId; });
                        if (aMatches.length > 0) {
                            oLocationModel.setData(aMatches[0]);
                        } else {
                            oLocationModel.setData({});
                        }
                    }
                },
                error: function () {
                    // No location data — form stays hidden
                }
            });
        },

        /**
         * Load project info from the configured SiteId
         */
        _loadProjectInfo: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oProjectModel = this.getView().getModel("projectModel");

            // Reset
            oProjectModel.setData({});

            if (!sSiteId) {
                return;
            }

            // Read Site to get ProjectId and SiteName, then read Project to get ProjectName
            oModel.read("/SiteSet(guid'" + sSiteId + "')", {
                success: function (oSiteData) {
                    if (oSiteData && oSiteData.ProjectId) {
                        oModel.read("/ProjectSet(guid'" + oSiteData.ProjectId + "')", {
                            success: function (oProjectData) {
                                // Combine SiteName and ProjectName into the same model
                                oProjectData.SiteName = oSiteData.SiteName;
                                oProjectModel.setData(oProjectData);
                            }
                        });
                    } else if (oSiteData) {
                        oProjectModel.setData({ SiteName: oSiteData.SiteName });
                    }
                }
            });
        },

        /* =========================================================== */
        /* WORK SUMMARY LOGIC — delegated to WorkSummaryDelegate        */
        /* =========================================================== */

        onNavToDashboard: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
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
        /* WBS Status Formatters                                        */
        /* =========================================================== */

        formatWbsStatusText: function (sStatus) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            switch (sStatus) {
                case "PLANNING": return oBundle.getText("planningStatus");
                case "PENDING_OPEN": return oBundle.getText("pendingOpenStatus") || "Pending Open";
                case "OPENED": return oBundle.getText("openedStatus") || "Opened";
                case "IN_PROGRESS": return oBundle.getText("inProgressStatus");
                case "PENDING_CLOSE": return oBundle.getText("pendingCloseStatus") || "Pending Close";
                case "CLOSED": return oBundle.getText("closedStatus") || "Closed";
                default: return sStatus || "";
            }
        },

        formatWbsStatusState: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "None";
                case "PENDING_OPEN": return "Information";
                case "OPENED": return "Success";
                case "IN_PROGRESS": return "Warning";
                case "PENDING_CLOSE": return "Information";
                case "CLOSED": return "None";
                // Legacy
                case "NEW": return "None";
                case "INP": return "Warning";
                default: return "None";
            }
        },

        formatWbsStatusIcon: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "sap-icon://status-in-process";
                case "PENDING_OPEN": return "sap-icon://paper-plane";
                case "OPENED": return "sap-icon://accept";
                case "IN_PROGRESS": return "sap-icon://machine";
                case "PENDING_CLOSE": return "sap-icon://paper-plane";
                case "CLOSED": return "sap-icon://locked";
                // Legacy
                case "NEW": return "sap-icon://status-in-process";
                case "INP": return "sap-icon://machine";
                case "DON": return "sap-icon://locked";
                default: return "sap-icon://status-in-process";
            }
        },

        isChildNode: function (vParentId) {
            if (!vParentId) return false;
            var sClean = vParentId.replace(/-/g, "");
            return !/^0+$/.test(sClean);
        },

        isParentNode: function (vParentId) {
            if (!vParentId) return true;
            var sClean = vParentId.replace(/-/g, "");
            return /^0+$/.test(sClean);
        },




    });

    // Mix in DailyLogDelegate functions
    Object.assign(WBSDetailController.prototype, {
        _bindDailyLogList: DailyLogDelegate._bindDailyLogList,
        onLogItemSelect: DailyLogDelegate.onLogItemSelect,
        onLogRowPress: DailyLogDelegate.onLogRowPress,
        _showLogDetail: DailyLogDelegate._showLogDetail,
        _loadResourceUse: DailyLogDelegate._loadResourceUse,
        onAddLog: DailyLogDelegate.onAddLog,
        onExportExcel: DailyLogDelegate.onExportExcel,
        onDownloadTemplate: DailyLogDelegate.onDownloadTemplate,
        onImportExcel: DailyLogDelegate.onImportExcel,
        _openImportPreviewDialog: DailyLogDelegate._openImportPreviewDialog,
        onImportPreviewSelectAll: DailyLogDelegate.onImportPreviewSelectAll,
        onImportPreviewDeselectAll: DailyLogDelegate.onImportPreviewDeselectAll,
        onConfirmImport: DailyLogDelegate.onConfirmImport,
        onCancelImport: DailyLogDelegate.onCancelImport,
        formatImportDate: DailyLogDelegate.formatImportDate,
        _importLogsSequentially: DailyLogDelegate._importLogsSequentially,
        onDeleteLog: DailyLogDelegate.onDeleteLog,
        onDeleteMultipleLogs: DailyLogDelegate.onDeleteMultipleLogs,
        onToggleEditMode: DailyLogDelegate.onToggleEditMode,
        onCancelEdit: DailyLogDelegate.onCancelEdit,
        onAddResourceUse: DailyLogDelegate.onAddResourceUse,
        onDeleteResourceUse: DailyLogDelegate.onDeleteResourceUse,
        onResourceIdChange: DailyLogDelegate.onResourceIdChange,
        onSaveLog: DailyLogDelegate.onSaveLog,
        _persistLog: DailyLogDelegate._persistLog,
        _saveResourceUse: DailyLogDelegate._saveResourceUse,
        _updateWbsActualDates: DailyLogDelegate._updateWbsActualDates,
        _verifyStatusForDailyLog: DailyLogDelegate._verifyStatusForDailyLog
    });

    // Mix in WorkSummaryDelegate functions to the controller prototype so XML views can resolve them during parsing
    Object.assign(WBSDetailController.prototype, {
        _loadWorkSummary: WorkSummaryDelegate._loadWorkSummary,
        formatPercentage: WorkSummaryDelegate.formatPercentage,
        formatProgress: WorkSummaryDelegate.formatProgress,
        formatQuantityState: WorkSummaryDelegate.formatQuantityState,
        formatProgressDisplay: WorkSummaryDelegate.formatProgressDisplay,
        formatTotalQty: WorkSummaryDelegate.formatTotalQty,
        formatWorkSummaryStatusState: WorkSummaryDelegate.formatWorkSummaryStatusState,
        formatWorkSummaryStatusIcon: WorkSummaryDelegate.formatWorkSummaryStatusIcon,
        onSubmitForApproval: WorkSummaryDelegate.onSubmitForApproval,
        formatStepClass: WorkSummaryDelegate.formatStepClass,
        formatStepLabelClass: WorkSummaryDelegate.formatStepLabelClass,
        formatStepLineClass: WorkSummaryDelegate.formatStepLineClass,
        formatStepIcon: WorkSummaryDelegate.formatStepIcon,
        formatStepLabel: WorkSummaryDelegate.formatStepLabel,
        formatStepNumber: WorkSummaryDelegate.formatStepNumber,
        formatStepNumberVisible: WorkSummaryDelegate.formatStepNumberVisible,
        formatCompletionRateTitle: WorkSummaryDelegate.formatCompletionRateTitle
    });

    // Mix in ApprovalLogDelegate functions to the controller prototype
    Object.assign(WBSDetailController.prototype, {
        onLogSelectionChange: ApprovalLogDelegate.onLogSelectionChange,
        formatApprovalActionText: ApprovalLogDelegate.formatApprovalActionText,
        formatApprovalActionState: ApprovalLogDelegate.formatApprovalActionState,
        formatApprovalActionIcon: ApprovalLogDelegate.formatApprovalActionIcon,
        onCloseApprovalDocument: ApprovalLogDelegate.onCloseApprovalDocument,
        _bindApprovalLogList: ApprovalLogDelegate._bindApprovalLogList,
        _initInvestorCanvas: ApprovalLogDelegate._initInvestorCanvas,

        /* =========================================================== */
        /* ACCEPTANCE DIALOG LOGIC                                     */
        /* =========================================================== */

        onSubmitApprovalPress: function () {
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            if (!oContext) return;

            if (!this._pSubmitTypeDialog) {
                this._pSubmitTypeDialog = sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "z.bts.buildtrack551.view.fragments.SubmitTypeSelection",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pSubmitTypeDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onCloseSubmitTypeDialog: function () {
            if (this._pSubmitTypeDialog) {
                this._pSubmitTypeDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onSelectOpenSubmission: function () {
            this.onCloseSubmitTypeDialog();
            var oView = this.getView();

            if (!this._pWbsInfoDialog) {
                this._pWbsInfoDialog = sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "z.bts.buildtrack551.view.fragments.WbsInfoDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pWbsInfoDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onSelectCloseSubmission: function () {
            this.onCloseSubmitTypeDialog();
            this._openAcceptanceReport();
        },

        onPressSubmitCloseWorkSummary: function () {
            var oView = this.getView();
            var oWbsCtx = oView.getBindingContext();

            if (!oWbsCtx) return;

            var sStatus = oWbsCtx.getProperty("Status");
            if (sStatus !== "IN_PROGRESS") {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                sap.m.MessageBox.error(oBundle.getText("inProgressOnlyCloseApprovalError", [""]));
                return;
            }

            // Immediately open report without redundant prompt
            this._openAcceptanceReport();
        },

        onPressSubmitOpenWorkSummary: function () {
            var that = this;
            var oView = this.getView();
            var oWbsCtx = oView.getBindingContext();
            if (!oWbsCtx) return;

            var sStatus = oWbsCtx.getProperty("Status");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (sStatus !== "PLANNING") {
                sap.m.MessageBox.error(oBundle.getText("planningOnlyOpenApprovalError", [""]));
                return;
            }
 
            sap.m.MessageBox.confirm(oBundle.getText("submitOpenApprovalConfirm", ["1"]), {
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        oView.setBusy(true);
                        that.getOwnerComponent().getModel().callFunction("/StartWSProcess", {
                            method: "POST",
                            urlParameters: { WS_ID: oWbsCtx.getProperty("WbsId") },
                            success: function () {
                                oView.setBusy(false);
                                sap.m.MessageToast.show(oBundle.getText("submitSuccess", ["1"]));
                                that.getOwnerComponent().getModel().refresh(true, true);
                            },
                            error: function () {
                                oView.setBusy(false);
                                sap.m.MessageBox.error(oBundle.getText("wbsSubmitError") || "Error on submission.");
                            }
                        });
                    }
                }
            });
        },

        onApproveOpenWorkSummary: function () {
            this._submitOpenDecision("0001", "Ký duyệt Mở");
        },

        onRejectOpenWorkSummary: function () {
            this._submitOpenDecision("0002", "Từ chối Mở");
        },

        _submitOpenDecision: function (sDecisionCode, sTitle) {
            var that = this;
            var oView = this.getView();
            var oViewData = oView.getModel("viewData");
            var oWbsCtx = oView.getBindingContext();
            var sWorkItemId = oViewData.getProperty("/activeWorkItemId");

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var fnSubmit = function (sId) {
                sap.m.MessageBox.confirm(oBundle.getText("decisionConfirm", [sTitle]) || "Do you want to " + sTitle + "?", {
                    onClose: function (sAction) {
                        if (sAction === sap.m.MessageBox.Action.OK) {
                            oView.setBusy(true);
                            that.getOwnerComponent().getModel().callFunction("/PostDecision", {
                                method: "POST",
                                urlParameters: {
                                    WI_ID: sId,
                                    Decision: sDecisionCode,
                                    Note: "Processed from Work Summary"
                                },
                                success: function (oData) {
                                    oView.setBusy(false);
                                    sap.m.MessageBox.success(oBundle.getText("processSuccess", ["1"]));
                                    that.getOwnerComponent().getModel().refresh(true, true);
                                },
                                error: function (oError) {
                                    oView.setBusy(false);
                                    sap.m.MessageBox.error(oBundle.getText("processError") || "Error processing decision.");
                                }
                            });
                        }
                    }
                });
            };

            if (sWorkItemId) {
                fnSubmit(sWorkItemId);
            } else {
                // Fallback robust check
                var sWbsId = oWbsCtx.getProperty("WbsId");
                var sStatus = oWbsCtx.getProperty("Status");
                var sApprovalType = (sStatus && sStatus.indexOf("OPEN") !== -1) ? "OPEN" : "CLOSE";
                oView.setBusy(true);
                that.getOwnerComponent().getModel().callFunction("/CheckDecision", {
                    method: "POST",
                    urlParameters: {
                        WBS_IDS: sWbsId,
                        ApprovalType: sApprovalType
                    },
                    success: function (oResponse) {
                        oView.setBusy(false);
                        var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision);
                        if (!oResult && oResponse.WORKITEM_ID) oResult = oResponse;

                        if (oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
                            oViewData.setProperty("/activeWorkItemId", oResult.WORKITEM_ID);
                            fnSubmit(oResult.WORKITEM_ID);
                        } else {
                            sap.m.MessageBox.error(oBundle.getText("workItemIdNotFoundError"));
                        }
                    },
                    error: function () {
                        oView.setBusy(false);
                        sap.m.MessageBox.error("Lỗi khi kiểm tra mã công việc.");
                    }
                });
            }
        },

        onPressViewAcceptanceReport: function () {
            this._openAcceptanceReport(false);
        },

        onPressSignAcceptanceReport: function () {
            this._openAcceptanceReport(true);
        },

        _openAcceptanceReport: function (bIsSignMode) {
            var oView = this.getView();
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oViewData = oView.getModel("viewData");
            var sWbsId = this._sWbsId;
            var sSiteId = this._sSiteId;
            var oContext = oView.getBindingContext();
            var oWbs = oContext ? oContext.getObject() : {};


            oView.setBusy(true);

            var fnFetchLogsAndOpenDialog = function (oResult) {
                var bActionable = false;
                var iUserLevel = 0;

                if (bIsSignMode && oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
                    bActionable = true;
                    // Extract UserLevel from logs if possible based on this WorkItemId
                    oViewData.setProperty("/activeWbs", Object.assign({}, oWbs, { WorkItemId: oResult.WORKITEM_ID }));
                }

                // 2. FETCH LATEST LOGS DIRECTLY (FILTER BY CLOSE TYPE)
                oModel.read("/ApprovalLogSet", {
                    filters: [
                        new Filter("WbsId", FilterOperator.EQ, sWbsId),
                        new Filter("ApprovalType", FilterOperator.EQ, "CLOSE")
                    ],
                    sorters: [new Sorter("CreatedTimestamp", false)],
                    success: function (oLogData) {
                        oView.setBusy(false);
                        var aAllLogs = oLogData.results || [];

                        // Force WbsId filter natively because backend sometimes ignores the API filter
                        var aLogs = aAllLogs.filter(function (log) {
                            return log.WbsId && log.WbsId.toLowerCase() === sWbsId.toLowerCase();
                        });

                        var oSignStatus = {
                            level1: { text: "[Chờ duyệt]", signed: false },
                            level2: { text: "[Chờ duyệt]", signed: false },
                            level3: { text: "[Chờ duyệt]", signed: false }
                        };

                        var bCycleEnded = false;
                        var sFoundWorkItemId = null;
                        var oUserModel = that.getOwnerComponent().getModel("userModel");
                        var myAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : 0;

                        // Force View Mode if closed
                        if (oWbs && oWbs.Status === "CLOSED") {
                            bIsSignMode = false;
                        }

                        // Safely sort descending by CreatedTimestamp handling OData V2 /Date(..)/ format
                        aLogs.sort(function (a, b) {
                            var tA = a.CreatedTimestamp ? parseInt((a.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                            var tB = b.CreatedTimestamp ? parseInt((b.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                            return tB - tA;
                        });

                        aLogs.forEach(function (log) {
                            if (bCycleEnded) return;

                            var sAction = (log.Action || "").toUpperCase().trim();
                            var iLevel = parseInt(log.ApprovalLevel) || 0;

                            // Extract WorkItemId directly from logs if CheckDecision didn't provide one
                            if (!sFoundWorkItemId && sAction.indexOf("ĐÃ NHẬN YÊU CẦU") !== -1 && iLevel === myAuthLevel && log.WorkItemId) {
                                sFoundWorkItemId = log.WorkItemId;
                            }

                            // Ignore informational routing logs from Workflow
                            if (sAction.indexOf("ĐÃ CHUYỂN LUỒNG") !== -1 || sAction.indexOf("ĐÃ NHẬN YÊU CẦU") !== -1 || sAction.indexOf("CẬP NHẬT TRẠNG THÁI") !== -1) {
                                return;
                            }

                            // Identify Submit actions (cycle start). Do NOT use iLevel === 0 alone to avoid terminating on blank system logs
                            var bIsSubmit = sAction === "0000" || sAction === "SUBMITTED" || sAction === "TẠO WBS";
                            if (bIsSubmit || (sAction.indexOf("GỬI") !== -1 && sAction.indexOf("YÊU CẦU") !== -1)) {
                                bCycleEnded = true;
                                return;
                            }

                            var bRejected = sAction === "0002" || sAction.indexOf("REJECT") !== -1 || sAction.indexOf("TỪ CHỐI") !== -1 || sAction === "ERROR";
                            if (bRejected) {
                                bCycleEnded = true; // Reject effectively nullifies older signatures for the active cycle
                                return;
                            }

                            var bApproved = false;
                            if (sAction === "0001" || sAction.indexOf("APPROVE") !== -1 || sAction.indexOf("SUCCESS") !== -1 || sAction.indexOf("ĐÃ KÝ") !== -1 || sAction.indexOf("KÝ DUY") !== -1 || sAction.indexOf("CHẤP THUẬN") !== -1) {
                                bApproved = true;
                            }
                            if (sAction.indexOf("DUYỆT") !== -1) {
                                bApproved = true;
                            }
                            if (sAction === "" && iLevel > 0) bApproved = true;

                            if (bApproved && !isNaN(iLevel)) {
                                var sSigner = log.ActionBy || log.CreatedBy || "Đã ký";
                                var sPath = "/UserRoleSet('" + sSigner + "')";
                                var sUserName = oView.getModel().getProperty(sPath + "/UserName");
                                var sSignatureUrl = oView.getModel().getProperty(sPath + "/SignatureUrl");

                                if (sUserName) {
                                    sSigner = sUserName;
                                } else {
                                    // Fetch async if not cached
                                    (function (userId, levelToUpdate) {
                                        oView.getModel().read("/UserRoleSet('" + userId + "')", {
                                            success: function (oUserData) {
                                                var currentStatus = oViewData.getProperty("/signStatus");
                                                if (levelToUpdate === 1) { currentStatus.level1.text = oUserData.UserName; currentStatus.level1.signatureUrl = oUserData.SignatureUrl; }
                                                if (levelToUpdate === 2) { currentStatus.level2.text = oUserData.UserName; currentStatus.level2.signatureUrl = oUserData.SignatureUrl; }
                                                if (levelToUpdate === 3) { currentStatus.level3.text = oUserData.UserName; currentStatus.level3.signatureUrl = oUserData.SignatureUrl; }
                                                oViewData.setProperty("/signStatus", currentStatus);
                                            }
                                        });
                                    })(sSigner, iLevel);
                                }

                                if (iLevel === 1 && !oSignStatus.level1.signed) oSignStatus.level1 = { text: sSigner, signatureUrl: sSignatureUrl, signed: true };
                                if (iLevel === 2 && !oSignStatus.level2.signed) oSignStatus.level2 = { text: sSigner, signatureUrl: sSignatureUrl, signed: true };
                                if (iLevel === 3 && !oSignStatus.level3.signed) oSignStatus.level3 = { text: sSigner, signatureUrl: sSignatureUrl, signed: true };
                            }
                            // Capture the level for current user if log matches current WorkItemId
                            if (bActionable && log.WorkItemId === oResult.WORKITEM_ID) {
                                iUserLevel = log.ApprovalLevel;
                            }
                            // IF THIS LOG IS THE START OF A CYCLE, STOP LOOKING AT OLDER LOGS
                            if ((sAction.indexOf("GỬI") !== -1 && sAction.indexOf("YÊU CẦU") !== -1) || sAction === "0000" || sAction === "SUBMITTED" || sAction === "TẠO WBS") {
                                bCycleEnded = true;
                            }
                        });

                        // Ensure defaults
                        if (!oSignStatus.level1.signed) {
                            oSignStatus.level1 = { text: "[Chờ duyệt]", signed: false };
                        }
                        if (!oSignStatus.level2.signed) {
                            oSignStatus.level2 = { text: "[Chờ duyệt]", signed: false };
                        }
                        if (!oSignStatus.level3.signed) {
                            oSignStatus.level3 = { text: "[Chờ duyệt]", signed: false };
                        }

                        // IF we clicked "Sign", evaluate business sequence logic directly.
                        if (bIsSignMode) {
                            var bAlreadySigned = false;
                            if (myAuthLevel === 1 && oSignStatus.level1.signed) bAlreadySigned = true;
                            if (myAuthLevel === 2 && oSignStatus.level2.signed) bAlreadySigned = true;
                            if (myAuthLevel === 3 && oSignStatus.level3.signed) bAlreadySigned = true;

                            var bPreviousSigned = true;
                            if (myAuthLevel === 2 && !oSignStatus.level1.signed) bPreviousSigned = false;
                            if (myAuthLevel === 3 && (!oSignStatus.level1.signed || !oSignStatus.level2.signed)) bPreviousSigned = false;

                            if (bAlreadySigned) {
                                // Downgrade to View Mode implicitly so they can see signatures but buttons hide
                                bIsSignMode = false;
                            } else if (!bPreviousSigned) {
                                sap.m.MessageBox.warning("Cần được phê duyệt bởi người trước đó trước khi tới lượt bạn.");
                                return; // DO NOT OPEN THE DIALOG
                            }
                        }

                        // Set WorkItemId only if we have it and we are actually signing
                        if (bIsSignMode && sFoundWorkItemId && !oViewData.getProperty("/activeWbs/WorkItemId")) {
                            oViewData.setProperty("/activeWbs", Object.assign({}, oWbs, { WorkItemId: sFoundWorkItemId }));
                            bActionable = true;
                        }

                        oViewData.setProperty("/signStatus", oSignStatus);
                        oViewData.setProperty("/userLevel", iUserLevel);

                        // When viewing, Inner 'Sign' buttons will be strictly hidden by /isApprovalMode = false
                        // We remove the strict bActionable dependency here so buttons render correctly based on logic
                        var bCanSign = (myAuthLevel > 0) && bIsSignMode;

                        oViewData.setProperty("/canApproveLevel1", bCanSign && myAuthLevel === 1 && !oSignStatus.level1.signed);
                        oViewData.setProperty("/canApproveLevel2", bCanSign && myAuthLevel === 2 && !oSignStatus.level2.signed);
                        oViewData.setProperty("/canApproveLevel3", bCanSign && myAuthLevel === 3 && !oSignStatus.level3.signed);
                        oViewData.setProperty("/canRejectFromReport", bCanSign);
                        oViewData.setProperty("/isApprovalMode", bCanSign);

                        // 4. Load other details
                        that._loadWorkSummary(sWbsId);
                        that._loadLocation(sWbsId);
                        that._loadProjectInfo(sSiteId);

                        // 5. Open Dialog
                        if (!that._pAcceptanceDialog) {
                            that._pAcceptanceDialog = sap.ui.core.Fragment.load({
                                id: oView.getId(),
                                name: "z.bts.buildtrack551.view.fragments.AcceptanceReport",
                                controller: that
                            }).then(function (oDialog) {
                                oView.addDependent(oDialog);
                                return oDialog;
                            });
                        }

                        that._pAcceptanceDialog.then(function (oDialog) {
                            oDialog.setBindingContext(oModel.createBindingContext("/WBSSet(guid'" + sWbsId + "')"));
                            oDialog.open();
                        });
                    },
                    error: function (oError) {
                        oView.setBusy(false);
                        console.error("Failed to fetch logs in WBS Detail:", oError);
                        // Open the dialog anyway but with minimal context so it doesn't break
                        if (!that._pAcceptanceDialog) {
                            that._pAcceptanceDialog = sap.ui.core.Fragment.load({
                                id: oView.getId(),
                                name: "z.bts.buildtrack551.view.fragments.AcceptanceReport",
                                controller: that
                            }).then(function (oDialog) {
                                oView.addDependent(oDialog);
                                return oDialog;
                            });
                        }

                        // Just load other details to populate what we can
                        that._loadWorkSummary(sWbsId);
                        that._loadLocation(sWbsId);
                        that._loadProjectInfo(sSiteId);

                        that._pAcceptanceDialog.then(function (oDialog) {
                            oDialog.setBindingContext(oModel.createBindingContext("/WBSSet(guid'" + sWbsId + "')"));
                            oDialog.open();
                        });
                    }
                });
            };

            // 1b. Check if user can approve this item (for buttons in Acceptance Report)
            if (bIsSignMode) {
                // Uses robust wrapper to ensure failures in mock/backend do not halt dialog open process
                oModel.callFunction("/CheckDecision", {
                    method: "POST",
                    urlParameters: {
                        WBS_IDS: sWbsId,
                        ApprovalType: "CLOSE"
                    },
                    success: function (oResponse) {
                        var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision);
                        fnFetchLogsAndOpenDialog(oResult);
                    },
                    error: function (oErr) {
                        console.warn("CheckDecision failed in WBS Detail, ignoring and opening dialog.", oErr);
                        fnFetchLogsAndOpenDialog(null);
                    }
                });
            } else {
                // View mode skips /CheckDecision entirely to ensure pure ReadOnly path
                fnFetchLogsAndOpenDialog(null);
            }
        },

        onCloseWbsInfoDialog: function () {
            if (this._pWbsInfoDialog) {
                this._pWbsInfoDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onCloseAcceptanceDialog: function () {
            if (this._pAcceptanceDialog) {
                this._pAcceptanceDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onApproveFromReport: function () {
            this._submitDecisionFromReport("0001", "Ký duyệt (Approve)");
        },

        onRejectFromReport: function () {
            this._submitDecisionFromReport("0002", "Từ chối (Reject)");
        },

        _submitDecisionFromReport: function (sDecisionCode, sTitle) {
            var that = this;
            var oView = this.getView();
            var oModel = this.getOwnerComponent().getModel();
            var oViewData = oView.getModel("viewData");
            var oActiveWbs = oViewData.getProperty("/activeWbs");

            if (!oActiveWbs || !oActiveWbs.WorkItemId) {
                MessageBox.error("Không tìm thấy mã công việc (WorkItemId) để xử lý.");
                return;
            }

            MessageBox.confirm("Bạn có chắc chắn muốn thực hiện " + sTitle + " cho hạng mục này?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oView.setBusy(true);
                        oModel.callFunction("/PostDecision", {
                            method: "POST",
                            urlParameters: {
                                WI_ID: oActiveWbs.WorkItemId,
                                Decision: sDecisionCode,
                                Note: "Processed from Acceptance Report"
                            },
                            success: function (oData) {
                                oView.setBusy(false);
                                if (typeof that.onCloseAcceptanceDialog === "function") {
                                    that.onCloseAcceptanceDialog();
                                }
                                MessageBox.success("Đã xử lý quyết định thành công.");
                                oModel.refresh(true); // Force cache invalidation to prevent signing loops
                                that._bindApprovalLogList(oActiveWbs.WbsId);

                                // Re-check actionability so button text updates to 'Xem biên bản'
                                if (typeof that._checkIfActionable === "function") {
                                    that._checkIfActionable(oActiveWbs.WbsId);
                                }

                                // Refresh WBS Detail
                                var oBinding = oView.getElementBinding();
                                if (oBinding) { oBinding.refresh(); }
                            },
                            error: function (oError) {
                                oView.setBusy(false);
                                var sMsg = "Lỗi khi xử lý quyết định.";
                                try {
                                    var oErr = JSON.parse(oError.responseText);
                                    sMsg = oErr.error.message.value || sMsg;
                                } catch (e) { }
                                MessageBox.error(sMsg);
                            }
                        });
                    }
                }
            });
        },

        onSubmitForApproval: function () {
            // This is for "CLOSE" type - includes validation logic
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            var sStatus = oContext ? oContext.getProperty("Status") : "";

            if (sStatus === "PENDING_CLOSE") {
                sap.m.MessageBox.error("Hạng mục này đã được gửi phê duyệt đóng và đang chờ xử lý.");
                return;
            }

            if (sStatus === "CLOSED") {
                sap.m.MessageBox.information("Hạng mục này đã hoàn thành và được đóng.");
                return;
            }

            if (sStatus !== "IN_PROGRESS") {
                sap.m.MessageBox.warning("Hạng mục phải ở trạng thái 'In Progress' (Đang thi công) mới có thể gửi phê duyệt đóng.");
                return;
            }

            this.onCloseAcceptanceDialog();
            WorkSummaryDelegate.onSubmitForApproval.call(this);
        },

        onDirectSubmitWS: function () {
            // This is for "OPEN" type - calls API directly without confirmation
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            var sStatus = oContext ? oContext.getProperty("Status") : "";

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (sStatus === "PENDING_OPEN") {
                sap.m.MessageBox.error(oBundle.getText("wbsPendingOpenError") || "This item is pending open.");
                return;
            }

            if (sStatus === "CLOSED") {
                sap.m.MessageBox.information(oBundle.getText("wbsClosedInfo") || "This item is closed.");
                return;
            }

            if (sStatus !== "PLANNING") {
                sap.m.MessageBox.warning(oBundle.getText("planningOnlyOpenApprovalError", [""]));
                return;
            }

            var sWbsId = this._sWbsId;
            var oModel = this.getOwnerComponent().getModel();

            this.onCloseWbsInfoDialog();
            oView.setBusy(true);

            oModel.callFunction("/StartWSProcess", {
                method: "POST",
                urlParameters: {
                    WS_ID: sWbsId
                },
                success: function (oData) {
                    oView.setBusy(false);
                    var sSuccessMsg = oData && oData.MESSAGE ? oData.MESSAGE : oBundle.getText("submitSuccess", ["1"]);
                    var sErrorMsg = oData && oData.MESSAGE ? oData.MESSAGE : oBundle.getText("wbsSubmitError");

                    if (oData && oData.SUCCESS === false) {
                        sap.m.MessageBox.error(sErrorMsg);
                        return;
                    }

                    sap.m.MessageBox.success(sSuccessMsg);
                    this._loadWorkSummary(sWbsId);
                    var oBinding = oView.getElementBinding();
                    if (oBinding) { oBinding.refresh(); }
                }.bind(this),
                error: function (oError) {
                    oView.setBusy(false);
                    var sMsg = oBundle.getText("wbsSubmitError");
                    try {
                        var oErr = JSON.parse(oError.responseText);
                        sMsg = oErr.error.message.value || sMsg;
                    } catch (e) { }
                    sap.m.MessageBox.error(sMsg);
                }
            });
        }
    });

    return WBSDetailController;
});