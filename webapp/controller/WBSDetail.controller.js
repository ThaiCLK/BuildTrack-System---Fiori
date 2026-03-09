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

            // Site model for Site info (e.g. Address)
            var oSiteModel = new JSONModel({});
            this.getView().setModel(oSiteModel, "siteModel");

            // Work Summary model
            var oWSModel = new JSONModel({});
            this.getView().setModel(oWSModel, "workSummaryModel");

<<<<<<< HEAD
            // Approval Log selection model
            var oApprovalLogModel = new JSONModel({ isSelected: false });
            this.getView().setModel(oApprovalLogModel, "approvalLogModel");

            // Import Preview model
            var oImportPreviewModel = new JSONModel({
                logs: []
            });
            this.getView().setModel(oImportPreviewModel, "importPreviewModel");
=======
            // Project model for parent project info
            var oProjectModel = new JSONModel({});
            this.getView().setModel(oProjectModel, "projectModel");
>>>>>>> thaiclk2
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

            // Bind approval log list
            this._bindApprovalLogList(sWbsId);

            // Load location info
            this._loadLocation(sWbsId);

<<<<<<< HEAD
            // Load Work Summary info (will also trigger _bindApprovalLogList when done)
            this._loadWorkSummary(sWbsId);

            // Load Site info
            if (sSiteId) {
                this._loadSite(sSiteId);
            }

            // Reset detail panel
=======
            // Load project info
            this._loadProjectInfo(sSiteId);

            // Load Work Summary info
            this._loadWorkSummary(sWbsId);

            // Reset daily log detail panel
>>>>>>> thaiclk2
            var oUIModel = this.getView().getModel("dailyLogModel");
            oUIModel.setProperty("/ui/isSelected", false);
            oUIModel.setProperty("/ui/editMode", false);
            oUIModel.setProperty("/selectedLog", null);

<<<<<<< HEAD
            // Reset approval log selection
            var oApprovalLogModel = this.getView().getModel("approvalLogModel");
            if (oApprovalLogModel) {
                oApprovalLogModel.setProperty("/isSelected", false);
=======
            // Reset approval log detail panel
            var oApprovalModel = this.getView().getModel("approvalModel");
            if (oApprovalModel) {
                oApprovalModel.setProperty("/selectedLog", {});
                oApprovalModel.setProperty("/ui/isSelected", false);
>>>>>>> thaiclk2
            }
        },

        /* =========================================================== */
        /* DAILY LOG LOGIC — delegated to DailyLogDelegate              */
        /* =========================================================== */

        /**
         * Bind the Approval Log list using /ApprovalLogSet filtered by WorkSummaryId.
         * Called after WorkSummary is loaded, since we need the WorkSummaryId.
         */
        _bindApprovalLogList: function (sWorkSummaryId) {
            var oList = this.byId("idApprovalLogList");
            if (!oList || !sWorkSummaryId) { return; }

            var that = this;
            var oFilter = new Filter("WorkSummaryId", FilterOperator.EQ, sWorkSummaryId);
            var oSorter = new Sorter("ActionOn", true); // Sort newest first

            oList.bindItems({
                path: "/ApprovalLogSet",
                filters: [oFilter],
                sorter: oSorter,
                template: new sap.m.StandardListItem({
                    title: { path: "Action", formatter: that.formatApprovalAction.bind(that) },
                    description: {
                        parts: ["ActionBy", "ActionOn"],
                        formatter: function (sBy, oOn) {
                            var sDate = oOn ? new sap.ui.model.type.Date({ pattern: "dd/MM/yyyy" }).formatValue(oOn, "string") : "";
                            return (sBy || "") + (sDate ? " - " + sDate : "");
                        }
                    },
                    info: "{Action}",
                    infoState: { path: "Action", formatter: that.formatApprovalActionState.bind(that) },
                    icon: { path: "Action", formatter: that.formatApprovalActionIcon.bind(that) }
                }),
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
<<<<<<< HEAD
         * Load the Site record to display Address
         */
        _loadSite: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oSiteModel = this.getView().getModel("siteModel");

            var sPath = "/SiteSet(guid'" + sSiteId + "')";
            oModel.read(sPath, {
                success: function (oData) {
                    if (oData) {
                        oSiteModel.setData(oData);
                        // Fetch Project Info to get Project Name
                        if (oData.ProjectId) {
                            var sProjectPath = "/ProjectSet(guid'" + oData.ProjectId + "')";
                            oModel.read(sProjectPath, {
                                success: function (oProjData) {
                                    if (oProjData) {
                                        oSiteModel.setProperty("/Project", oProjData);
                                    }
                                }
                            });
                        }
                    }
                },
                error: function () {
                    console.error("Failed to load Site:", sSiteId);
                }
            });
        },

        /**
         * Load the work summary record for a WBS.
         * TotalQuantityDone is aggregated by the backend — FE just GETs it.
=======
         * Load project info from the configured SiteId
>>>>>>> thaiclk2
         */
        _loadProjectInfo: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oProjectModel = this.getView().getModel("projectModel");

            // Reset
            oProjectModel.setData({});

<<<<<<< HEAD
            oModel.read("/WorkSummarySet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        var oSummaryData = oData.results[0]; // Use first element as a base for WorkSummaryId, Status etc.
                        oSummaryData.TotalQtyDone = oSummaryData.TotalQuantityDone || "0";
                        oWSModel.setData(oSummaryData);

                        // Bind Approval Log list now that we have WorkSummaryId
                        that._bindApprovalLogList(oSummaryData.WorkSummaryId);
                    } else {
                        oWSModel.setData({ TotalQtyDone: "0", Status: "" }); // Empty status if no logs
=======
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
>>>>>>> thaiclk2
                    }
                }
            });
        },

        /* =========================================================== */
        /* WORK SUMMARY LOGIC — delegated to WorkSummaryDelegate        */
        /* =========================================================== */

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
<<<<<<< HEAD
        /* APPROVAL OPERATIONS                                         */
        /* =========================================================== */

        onSubmitForApproval: function () {
            var oWSModel = this.getView().getModel("workSummaryModel");
            var oData = oWSModel.getData();
            if (!oData || !oData.WorkSummaryId) {
                sap.m.MessageBox.warning("Không có dữ liệu Work Summary để Submit. Vui lòng ghi Nhật ký thi công trước.");
                return;
            }

            var sWsId = oData.WorkSummaryId;
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            sap.ui.core.BusyIndicator.show(0);

            oModel.callFunction("/StartWSProcess", {
                method: "POST",
                urlParameters: {
                    WS_ID: sWsId
                },
                success: function (oResponse) {
                    sap.ui.core.BusyIndicator.hide();
                    sap.m.MessageToast.show("Đã gửi yêu cầu nghiệm thu thành công!");
                    // Refresh WS status
                    that._loadWorkSummary(that._sWbsId);
                },
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    var sMsg = "Lỗi khi gửi yêu cầu";
                    try {
                        var oErr = JSON.parse(oError.responseText);
                        if (oErr && oErr.error && oErr.error.message) {
                            sMsg = oErr.error.message.value;
                        }
                    } catch (e) { }
                    sap.m.MessageBox.error(sMsg);
                }
            });
        },

        onLogSelectionChange: function (oEvent) {
            // Show the document panel when a record is selected
            var oApprovalLogModel = this.getView().getModel("approvalLogModel");
            if (oApprovalLogModel) {
                oApprovalLogModel.setProperty("/isSelected", true);
            }
        },

        /* =========================================================== */
        /* Formatter Methods for Work Summary                          */
=======
        /* WBS Status Formatters                                        */
>>>>>>> thaiclk2
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
                // // Legacy
                // case "NEW": return "Planning";
                // case "INP": return "In Progress";
                // case "DON": return "Closed";
                // case "CAN": return "Closed";
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

<<<<<<< HEAD
        // ── Approval Log Action Formatters ────────────────────────
        formatApprovalAction: function (sAction) {
            switch (sAction) {
                case "SUBMITTED": return "Biên bản nghiệm thu";
                case "APPROVED": return "Đã duyệt";
                case "REJECTED": return "Đã từ chối";
                case "REVIEWED": return "Đang xem xét";
                default: return sAction || "Biên bản nghiệm thu";
            }
        },

        formatApprovalActionState: function (sAction) {
            switch (sAction) {
                case "SUBMITTED": return "Information";
                case "APPROVED": return "Success";
                case "REJECTED": return "Error";
                case "REVIEWED": return "Warning";
                default: return "None";
            }
        },

        formatApprovalActionIcon: function (sAction) {
            switch (sAction) {
                case "SUBMITTED": return "sap-icon://paper-plane";
                case "APPROVED": return "sap-icon://accept";
                case "REJECTED": return "sap-icon://decline";
                case "REVIEWED": return "sap-icon://inspect";
                default: return "sap-icon://document";
            }
        },

        /* =========================================================== */
        /* DAILY LOG — LIST PANEL                                       */
        /* =========================================================== */
=======
>>>>>>> thaiclk2



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
        _updateWbsActualDates: DailyLogDelegate._updateWbsActualDates
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
        onSubmitForApproval: WorkSummaryDelegate.onSubmitForApproval
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