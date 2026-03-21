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
                }
            });
            this.getView().setModel(oViewData, "viewData");

            // ── ĐỒNG BỘ ĐA TRÌNH DUYỆT SILENTLY CỰC XỊN ──
            // Khi người dùng (Level 2) click chuyển sang cửa sổ trình duyệt này (event 'focus'), 
            // tự động tải lại Log và CheckDecision một cách ÂM THẦM (không xoay vòng loading, không chớp giật)
            var that = this;
            window.addEventListener("focus", function() {
                var oCtx = that.getView().getBindingContext();
                if (oCtx && that._sWbsId) {
                    var sStatus = oCtx.getProperty("Status");
                    
                    // 1. Silent Refresh Approval Logs (cập nhật Process Flow thẻ xanh)
                    if (typeof that._bindApprovalLogList === "function") {
                        that._bindApprovalLogList(that._sWbsId, true); // true = bSilent
                    }

                    // 2. Silent Refresh Actionability (hiện nút bấm nếu có quyền mới)
                    var sActionableType = "OPEN";
                    if (sStatus === "PENDING_CLOSE" || sStatus === "CLOSED" || sStatus === "CLOSE_REJECTED") {
                        sActionableType = "CLOSE";
                    }
                    if (typeof that._checkIfActionable === "function") {
                        that._checkIfActionable(that._sWbsId, sActionableType);
                    }
                }
            });
        },        /* =========================================================== */
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
        },

        _checkIfActionable: function (sWbsId, sStatus) {
            var oModel = this.getOwnerComponent().getModel();
            var oViewData = this.getView().getModel("viewData");
            oViewData.setProperty("/isActionableWorkSummary", false);

            var sApprovalType = (sStatus && sStatus.indexOf("OPEN") !== -1) ? "OPEN" : "CLOSE";

            // Fire async to set actionable state for Work Summary button
            oModel.callFunction("/CheckDecision", {
                method: "POST",
                urlParameters: {
                    WBS_IDS: sWbsId,
                    ApprovalType: sApprovalType
                },
                success: function (oResponse) {
                    var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision);
                    if (oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
                        oViewData.setProperty("/isActionableWorkSummary", true);
                        oViewData.setProperty("/activeWorkItemId", oResult.WORKITEM_ID);
                    }
                }
            });
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



        onPressSubmitCloseWorkSummary: function () {
            var oView = this.getView();
            var oWbsCtx = oView.getBindingContext();
            var that = this;

            if (!oWbsCtx) return;

            var sStatus = oWbsCtx.getProperty("Status");
            if (sStatus !== "IN_PROGRESS" && sStatus !== "CLOSE_REJECTED") {
                sap.m.MessageBox.error("Hạng mục phải ở trạng thái 'In Progress' hoặc 'Close Rejected' mới có thể gửi phê duyệt đóng.");
                return;
            }

            sap.m.MessageBox.confirm("Bạn có chắc chắn muốn gửi duyệt Đóng hạng mục này không?", {
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        WorkSummaryDelegate.onSubmitForApproval.call(that);
                    }
                }
            });
        },

        onPressSubmitOpenWorkSummary: function () {
            var that = this;
            var oView = this.getView();
            var oWbsCtx = oView.getBindingContext();
            if (!oWbsCtx) return;

            var sStatus = oWbsCtx.getProperty("Status");
            if (sStatus !== "PLANNING" && sStatus !== "OPEN_REJECTED") {
                sap.m.MessageBox.error("Hạng mục phải ở trạng thái 'Planning' hoặc 'Open Rejected' mới có thể gửi phê duyệt mở.");
                return;
            }

            sap.m.MessageBox.confirm("Bạn có chắc chắn muốn gửi duyệt Mở hạng mục này không?", {
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        oView.setBusy(true);
                        that.getOwnerComponent().getModel().callFunction("/StartWSProcess", {
                            method: "POST",
                            urlParameters: { WS_ID: oWbsCtx.getProperty("WbsId") },
                            success: function () {
                                oView.setBusy(false);
                                sap.m.MessageToast.show("Đã gửi duyệt Mở thành công.");
                                oView.getElementBinding().refresh();
                            },
                            error: function () {
                                oView.setBusy(false);
                                sap.m.MessageBox.error("Lỗi khi gửi duyệt Mở.");
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

            // Xử lý fallback cực mạnh: Nếu view mảng activeWorkItemId bị rỗng do bất đồng bộ,
            // ta chọc thẳng vào danh sách pendingOpenWBS mà bên SiteDetail đã lưu lại sẵn!
            if (!sWorkItemId) {
                var aPending = oViewData.getProperty("/pendingOpenWBS") || [];
                var sCurrentWbsId = oWbsCtx ? oWbsCtx.getProperty("WbsId") : "";
                var oMatch = aPending.find(function (w) { return w.WbsId === sCurrentWbsId; });
                if (oMatch && oMatch.WorkItemId && oMatch.WorkItemId !== "000000000000") {
                    sWorkItemId = oMatch.WorkItemId;
                }
            }

            if (!sWorkItemId || sWorkItemId === "000000000000") {
                var oUserModel = oView.getModel("userModel");
                var sAuthLevel = oUserModel ? String(oUserModel.getProperty("/authLevel")) : "";
                var sMessage = "Không thể ký duyệt vui lòng kiểm tra lại.";

                if (sAuthLevel === "2") {
                    sMessage = "Không thể ký duyệt vì Kỹ Sư Phụ Trách chưa hoàn thành phê duyệt.";
                } else if (sAuthLevel === "3") {
                    sMessage = "Không thể ký duyệt vì Tư Vấn Giám Sát chưa hoàn thành phê duyệt.";
                }
                sap.m.MessageBox.error(sMessage + " (Work Item ID is missing)");
                return;
            }

            sap.m.MessageBox.confirm("Bạn có chắc chắn muốn thực hiện " + sTitle + " cho hạng mục này?", {
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        oView.setBusy(true);
                        that.getOwnerComponent().getModel().callFunction("/PostDecision", {
                            method: "POST",
                            urlParameters: {
                                WI_ID: sWorkItemId,
                                Decision: sDecisionCode,
                                Note: "Processed from Work Summary"
                            },
                            success: function (oData) {
                                oView.setBusy(false);
                                sap.m.MessageBox.success("Đã xử lý quyết định thành công.");
                                oView.getElementBinding().refresh();
                            },
                            error: function (oError) {
                                oView.setBusy(false);
                                sap.m.MessageBox.error("Lỗi khi xử lý quyết định.");
                            }
                        });
                    }
                }
            });
        },

        _openAcceptanceReport: function () {
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

                if (oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
                    bActionable = true;
                    // Extract UserLevel from logs if possible based on this WorkItemId
                    oViewData.setProperty("/activeWbs", Object.assign({}, oWbs, { WorkItemId: oResult.WORKITEM_ID }));
                }

                // 2. FETCH LATEST LOGS DIRECTLY WITH NO APPROVALTYPE RESTRICTION
                // The SAP backend might not set 'ApprovalType'='CLOSE' for signature logs, so fetch all logs for this WbsId
                oModel.read("/ApprovalLogSet", {
                    filters: [
                        new Filter("WbsId", FilterOperator.EQ, sWbsId)
                    ],
                    sorters: [new Sorter("CreatedTimestamp", false)],
                    urlParameters: {
                        "cb": new Date().getTime() // Cache buster
                    },
                    success: function (oLogData) {
                        oView.setBusy(false);
                        var aLogs = oLogData.results || [];

                        // Cực kỳ quan trọng: Server SAP BỎ QUA lệnh Sorter của OData, nên nó luôn trả về Log CŨ NHẤT nằm trên cùng!
                        // Do đó ta phải tự Sort lại thủ công bằng Javascript (Mới nhất lên đầu) trước khi duyệt vòng lặp.
                        aLogs.sort(function (a, b) {
                            var t1 = a.CreatedTimestamp ? new Date(a.CreatedTimestamp).getTime() : 0;
                            var t2 = b.CreatedTimestamp ? new Date(b.CreatedTimestamp).getTime() : 0;
                            return t2 - t1; // Descending: Newest first
                        });

                        console.log("=== THÔNG TIN TỪ BACKEND SAP: ===");
                        console.log("SỐ LƯỢNG LOGS VỀ WBS NÀY:", aLogs.length);
                        console.log("CHI TIẾT MẢNG L0GS:", aLogs);

                        var oSignStatus = {
                            level1: { text: "[Chờ duyệt]", signed: false },
                            level2: { text: "[Chờ duyệt]", signed: false },
                            level3: { text: "[Chờ duyệt]", signed: false }
                        };

                        var bCycleEnded = false;

                        aLogs.forEach(function (log) {
                            if (bCycleEnded) return;

                            var sAction = (log.Action || "").toUpperCase().trim();
                            var iLevel = parseInt(log.ApprovalLevel);
                            console.log("Đang xét Log - Action:", sAction, "| Level:", iLevel, "| By:", log.ActionBy);

                            var bApproved = false;

                            // Broaden approval check to catch all variations of approval actions
                            if (sAction.indexOf("PHÊ DUYỆT YÊU CẦU ĐÓNG WBS") >= 0 || sAction.indexOf("PHÊ DUYỆT YÊU CẦU MỞ WBS") >= 0) {
                                bApproved = true;
                            } else if (sAction === "0001" || sAction === "APPROVED" || sAction === "SUCCESS" || sAction === "ĐÃ PHÊ DUYỆT" || sAction === "KÝ DUYÊT" || sAction === "KÝ DUYỆT") {
                                bApproved = true;
                            } else if (sAction.indexOf("CHẤP THUẬN") >= 0 || sAction.indexOf("APPROVE") >= 0) {
                                bApproved = true;
                            }

                            if (bApproved && !isNaN(iLevel)) {
                                var sSigner = log.ActionBy || log.CreatedBy || "Đã ký";
                                var sPath = "/UserRoleSet('" + sSigner + "')";
                                var sUserName = oView.getModel().getProperty(sPath + "/UserName");
                                if (sUserName) {
                                    sSigner = sUserName;
                                } else {
                                    // Fetch async if not cached
                                    (function (userId, levelToUpdate) {
                                        oView.getModel().read("/UserRoleSet('" + userId + "')", {
                                            success: function (oUserData) {
                                                var currentStatus = oViewData.getProperty("/signStatus");
                                                if (levelToUpdate === 1) currentStatus.level1.text = oUserData.UserName;
                                                if (levelToUpdate === 2) currentStatus.level2.text = oUserData.UserName;
                                                if (levelToUpdate === 3) currentStatus.level3.text = oUserData.UserName;
                                                oViewData.setProperty("/signStatus", currentStatus);
                                            }
                                        });
                                    })(sSigner, iLevel);
                                }

                                if (iLevel === 1 && !oSignStatus.level1.signed) oSignStatus.level1 = { text: sSigner, signed: true };
                                if (iLevel === 2 && !oSignStatus.level2.signed) oSignStatus.level2 = { text: sSigner, signed: true };
                                if (iLevel === 3 && !oSignStatus.level3.signed) oSignStatus.level3 = { text: sSigner, signed: true };
                            }
                            // Capture the level for current user if log matches current WorkItemId
                            if (bActionable && log.WorkItemId === oResult.WORKITEM_ID) {
                                iUserLevel = log.ApprovalLevel;
                            }
                            // IF THIS LOG IS THE START OF A CYCLE, STOP LOOKING AT OLDER LOGS
                            if (sAction === "GỬI YÊU CẦU PHÊ DUYỆT ĐÓNG WBS" || sAction === "GỬI YÊU CẦU PHÊ DUYỆT MỞ WBS" || sAction === "0000" || sAction === "SUBMITTED") {
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

                        oViewData.setProperty("/signStatus", oSignStatus);
                        oViewData.setProperty("/userLevel", iUserLevel);

                        // 3. Action Visibility
                        var oUserModel = that.getOwnerComponent().getModel("userModel");
                        iUserLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : 0;
                        var bCanSign = (iUserLevel > 0) && bActionable;

                        oViewData.setProperty("/canApproveLevel1", bCanSign && iUserLevel === 1 && !oSignStatus.level1.signed);
                        oViewData.setProperty("/canApproveLevel2", bCanSign && iUserLevel === 2 && !oSignStatus.level2.signed);
                        oViewData.setProperty("/canApproveLevel3", bCanSign && iUserLevel === 3 && !oSignStatus.level3.signed);
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
                                name: "z.bts.buildtrack.view.fragments.AcceptanceReport",
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
                                name: "z.bts.buildtrack.view.fragments.AcceptanceReport",
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

            // Try getting from primary CheckDecision field first
            var sWorkItemId = oViewData.getProperty("/activeWorkItemId");

            // Fallback to the one saved specifically by _openAcceptanceReport's call
            if (!sWorkItemId) {
                var oActiveWbs = oViewData.getProperty("/activeWbs");
                if (oActiveWbs && oActiveWbs.WorkItemId) {
                    sWorkItemId = oActiveWbs.WorkItemId;
                }
            }

            // Xử lý fallback cực mạnh tương tự luồng MỞ: Chọc thẳng vào list pendingCloseWBS bên ngoài
            if (!sWorkItemId) {
                var aPendingClose = oViewData.getProperty("/pendingCloseWBS") || [];
                var oWbsCtx = oView.getBindingContext();
                var sCurrentWbsId = oWbsCtx ? oWbsCtx.getProperty("WbsId") : "";
                var oMatch = aPendingClose.find(function (w) { return w.WbsId === sCurrentWbsId; });
                if (oMatch && oMatch.WorkItemId && oMatch.WorkItemId !== "000000000000") {
                    sWorkItemId = oMatch.WorkItemId;
                }
            }

            if (!sWorkItemId || sWorkItemId === "000000000000") {
                var oUserModel = oView.getModel("userModel");
                var sAuthLevel = oUserModel ? String(oUserModel.getProperty("/authLevel")) : "";
                var sMessage = "Không thể ký duyệt vì cấp trước chưa hoàn thành phê duyệt.";

                if (sAuthLevel === "2") {
                    sMessage = "Không thể ký duyệt vì Kỹ Sư Phụ Trách chưa hoàn thành phê duyệt.";
                } else if (sAuthLevel === "3") {
                    sMessage = "Không thể ký duyệt vì Tư Vấn Giám Sát chưa hoàn thành phê duyệt.";
                }

                sap.m.MessageBox.error(sMessage);
                return;
            }

            sap.m.MessageBox.confirm("Bạn có chắc chắn muốn thực hiện " + sTitle + " cho hạng mục này?", {
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        oView.setBusy(true);
                        oModel.callFunction("/PostDecision", {
                            method: "POST",
                            urlParameters: {
                                WI_ID: sWorkItemId,
                                Decision: sDecisionCode,
                                Note: "Processed from Acceptance Report"
                            },
                            success: function (oData) {
                                oView.setBusy(false);

                                sap.m.MessageBox.success("Đã xử lý quyết định thành công.");

                                // Update local signStatus immediately so UI reflects signature
                                if (sDecisionCode === "0001") {
                                    var oUserModel = oView.getModel("userModel");
                                    var sAuthLevel = oUserModel ? String(oUserModel.getProperty("/authLevel")) : "";
                                    var sFullName = oUserModel ? (oUserModel.getProperty("/fullName") || oUserModel.getProperty("/userName") || "Đã ký") : "Đã ký";
                                    var oSignStatus = oViewData.getProperty("/signStatus");

                                    if (sAuthLevel === "1") {
                                        oSignStatus.level1 = { text: sFullName, signed: true };
                                    } else if (sAuthLevel === "2") {
                                        oSignStatus.level2 = { text: sFullName, signed: true };
                                    } else if (sAuthLevel === "3") {
                                        oSignStatus.level3 = { text: sFullName, signed: true };
                                    }

                                    oViewData.setProperty("/signStatus", oSignStatus);
                                } else {
                                    // If reject, close the dialog because the flow is broken
                                    if (typeof that.onCloseAcceptanceDialog === "function") {
                                        that.onCloseAcceptanceDialog();
                                    }
                                }

                                var oWbsCtx = oView.getBindingContext();
                                if (oWbsCtx) {
                                    var sWbsId = oWbsCtx.getProperty("WbsId");
                                    that._bindApprovalLogList(sWbsId);
                                    if (typeof that._checkIfActionable === "function") {
                                        that._checkIfActionable(sWbsId, oWbsCtx.getProperty("Status"));
                                    }
                                }

                                var oBinding = oView.getElementBinding();
                                if (oBinding) { oBinding.refresh(); }
                            },
                            error: function (oError) {
                                oView.setBusy(false);
                                sap.m.MessageBox.error("Lỗi khi xử lý quyết định.");
                            }
                        });
                    }
                }
            });
        },

        onDirectSubmitWS: function () {
            // This is for "OPEN" type - calls API directly without confirmation
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            var sStatus = oContext ? oContext.getProperty("Status") : "";

            if (sStatus === "PENDING_OPEN") {
                sap.m.MessageBox.error("Hạng mục này đã được gửi phê duyệt mở và đang chờ xử lý.");
                return;
            }

            if (sStatus === "CLOSED") {
                sap.m.MessageBox.information("Hạng mục này đã hoàn thành và được đóng.");
                return;
            }

            if (sStatus !== "PLANNING" && sStatus !== "OPEN_REJECTED") {
                sap.m.MessageBox.warning("Chỉ những hạng mục ở trạng thái 'Planning' hoặc bị từ chối mở mới có thể gửi phê duyệt mở.");
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
                    if (oData && oData.SUCCESS === false) {
                        sap.m.MessageBox.error(oData.MESSAGE || "Failed to submit for approval.");
                        return;
                    }

                    sap.m.MessageBox.success(oData.MESSAGE || "Work Summary submitted for approval successfully.");
                    this._loadWorkSummary(sWbsId);
                    var oBinding = oView.getElementBinding();
                    if (oBinding) { oBinding.refresh(); }
                }.bind(this),
                error: function (oError) {
                    oView.setBusy(false);
                    var sMsg = "Failed to submit for approval.";
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