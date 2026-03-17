sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "z/bts/buildtrack/controller/delegate/DailyLogDelegate",
    "z/bts/buildtrack/controller/delegate/WorkSummaryDelegate",
    "z/bts/buildtrack/controller/delegate/ApprovalLogDelegate"
], function (Controller, History, MessageBox, MessageToast, JSONModel, Filter, FilterOperator, Sorter, DailyLogDelegate, WorkSummaryDelegate, ApprovalLogDelegate) {
    "use strict";


    var WBSDetailController = Controller.extend("z.bts.buildtrack.controller.WBSDetail", {

        /* =========================================================== */
        /* LIFECYCLE                                                    */
        /* =========================================================== */
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
                events: {
                    dataRequested: function () { this.getView().setBusy(true); }.bind(this),
                    dataReceived: function () { 
                        this.getView().setBusy(false); 
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
                        oLocationModel.setData(oData.results[0]);
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
            switch (sStatus) {
                case "PLANNING": return "Planning";
                case "PENDING_OPEN": return "Pending Open";
                case "OPEN_REJECTED": return "Open Rejected";
                case "OPENED": return "Opened";
                case "IN_PROGRESS": return "In Progress";
                case "PENDING_CLOSE": return "Pending Close";
                case "CLOSE_REJECTED": return "Close Rejected";
                case "CLOSED": return "Closed";
                default: return sStatus || "";
            }
        },

        formatWbsStatusState: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "None";
                case "PENDING_OPEN": return "Information";
                case "OPEN_REJECTED": return "Error";
                case "OPENED": return "Success";
                case "IN_PROGRESS": return "Warning";
                case "PENDING_CLOSE": return "Information";
                case "CLOSE_REJECTED": return "Error";
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
                case "OPEN_REJECTED": return "sap-icon://decline";
                case "OPENED": return "sap-icon://accept";
                case "IN_PROGRESS": return "sap-icon://machine";
                case "PENDING_CLOSE": return "sap-icon://paper-plane";
                case "CLOSE_REJECTED": return "sap-icon://decline";
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
        formatStepNumberVisible: WorkSummaryDelegate.formatStepNumberVisible
    });

    // Mix in ApprovalLogDelegate functions to the controller prototype
    Object.assign(WBSDetailController.prototype, {
        onLogSelectionChange: ApprovalLogDelegate.onLogSelectionChange,
        formatApprovalActionText: ApprovalLogDelegate.formatApprovalActionText,
        formatApprovalActionState: ApprovalLogDelegate.formatApprovalActionState,
        formatApprovalActionIcon: ApprovalLogDelegate.formatApprovalActionIcon,
        onCloseApprovalDocument: ApprovalLogDelegate.onCloseApprovalDocument,
        _bindApprovalLogList: ApprovalLogDelegate._bindApprovalLogList,
        _initInvestorCanvas: ApprovalLogDelegate._initInvestorCanvas
    });

    return WBSDetailController;
});