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
                    name: "z.bts.buildtrack.view.fragments.SubmitTypeSelection",
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
                    name: "z.bts.buildtrack.view.fragments.WbsInfoDialog",
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

            // 1b. Check if user can approve this item (for buttons in Acceptance Report)
            oModel.callFunction("/CheckDecision", {
                method: "POST",
                urlParameters: {
                    WBS_IDS: sWbsId,
                    ApprovalType: "CLOSE"
                },
                success: function (oResponse) {
                    var oResult = oResponse.CheckDecision || (oResponse.results && oResponse.results.CheckDecision);
                    var bActionable = false;
                    var iUserLevel = 0;

                    if (oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
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
                            var aLogs = oLogData.results || [];
                            
                            var oSignStatus = {
                                level1: { text: "[Chờ duyệt]", signed: false },
                                level2: { text: "[Chờ duyệt]", signed: false },
                                level3: { text: "[Chờ duyệt]", signed: false }
                            };

                            var bCycleEnded = false;

                            aLogs.slice().reverse().forEach(function (log) {
                                if (bCycleEnded) return;

                                var sAction = (log.Action || "").toUpperCase().trim();
                                var iLevel = parseInt(log.ApprovalLevel);
                                
                                var bApproved = false;
                                if (sAction === "0001" || sAction === "APPROVED" || sAction === "SUCCESS" || sAction === "ĐÃ PHÊ DUYỆT" || sAction === "KÝ DUYÊT") {
                                    bApproved = true;
                                } else if (sAction.indexOf("CHẤP THUẬN YÊU CẦU ĐÓNG WBS") === 0) {
                                    // Only match exactly "CHẤP THUẬN YÊU CẦU ĐÓNG WBS" (possibly followed by "(Cấp X)")
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
                                        (function(userId, levelToUpdate) {
                                            oView.getModel().read("/UserRoleSet('" + userId + "')", {
                                                success: function(oUserData) {
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
                            var bCanSign = (iUserLevel > 0);
                            
                            console.log("Approval Debug: UserLevel =", iUserLevel, "bCanSign =", bCanSign);
                            console.log("Sign Statuses:", oSignStatus);
                            
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
                            MessageBox.error("Không thể tải lịch sử phê duyệt.");
                        }
                    });
                },
                error: function (oErr) {
                    oView.setBusy(false);
                    console.warn("CheckDecision failed in WBS Detail", oErr);
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
                                WORKITEM_ID: oActiveWbs.WorkItemId,
                                DECISION: sDecisionCode,
                                NOTE: "Processed from Acceptance Report"
                            },
                            success: function (oData) {
                                oView.setBusy(false);
                                MessageBox.success("Đã xử lý quyết định thành công.");
                                that._bindApprovalLogList(oActiveWbs.WbsId);
                                
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