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
    "z/bts/buildtrack551/controller/delegate/ApprovalLogDelegate",
    "z/bts/buildtrack551/controller/delegate/DependencyDelegate"
], function (Controller, History, MessageBox, MessageToast, JSONModel, Filter, FilterOperator, Sorter, DailyLogDelegate, WorkSummaryDelegate, ApprovalLogDelegate, DependencyDelegate) {
    "use strict";


    var WBSDetailController = Controller.extend("z.bts.buildtrack551.controller.WBSDetail", {

        formatWbsDetailTitle: function (sWbsName) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText("wbsDetailTitle", [sWbsName || ""]);
        },

        formatActualDate: function (v) {
            if (!v) return "—";
            var d = (v instanceof Date) ? v : new Date(v);
            if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "—";
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
            return oDateFormat.format(d);
        },

        formatQuantityInt: function (v) {
            if (!v) return "0";
            var f = parseFloat(v);
            return isNaN(f) ? "0" : Math.round(f).toString();
        },


        /* =========================================================== */
        /* LIFECYCLE                                                    */
        /* =========================================================== */
        onNavBack: function () {
            this.onCancelWbs();
            if (this.resetLogDetailState) {
                this.resetLogDetailState();
            }
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteMain", {}, true);
            }
        },

        onTabSelect: function (oEvent) {
            this.onCancelWbs();
            if (this.resetLogDetailState) {
                this.resetLogDetailState();
            }
            // Clear selections when switching tabs
            var oLogTable = this.byId("idDailyLogList");
            if (oLogTable) {
                oLogTable.removeSelections();
            }
        },

        /* =========================================================== */
        /* INLINE EDIT MODE - WBS DETAIL INFO                            */
        /* =========================================================== */
        onEditWbs: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_WBS & ZBT_LOCATION — AuthLevel 1 (Lead Engineer) or 99 (System Admin)
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            if (iAuthLevel !== 1 && iAuthLevel !== 99) {
                MessageBox.error(oBundle.getText("wbsPermissionError"));
                return;
            }

            var oProjectData = this.getView().getModel("projectModel").getData();
            var oCtx = this.getView().getBindingContext();
            var sWbsStatus = oCtx ? oCtx.getProperty("Status") : "";

            // Pre-check hierarchy status before entering edit mode
            if (oProjectData.Status === "CLOSED") {
                MessageBox.error(oBundle.getText("locationEditProjectClosed"));
                return;
            }
            if (oProjectData.SiteStatus === "CLOSED") {
                MessageBox.error(oBundle.getText("locationEditSiteClosed"));
                return;
            }
            if (sWbsStatus !== "PLANNING" && sWbsStatus !== "OPEN_REJECTED") {
                MessageBox.error(oBundle.getText("wbsEditPlanningOnlyError"));
                return;
            }

            this.getView().getModel("viewData").setProperty("/editMode", true);

            // Set minDate only when entering edit mode and binding context is already loaded
            if (oCtx) {
                var oToday = new Date();
                oToday.setHours(0, 0, 0, 0);

                var dStart = oCtx.getProperty("StartDate");
                var dEnd = oCtx.getProperty("EndDate");

                // Allow existing past dates: use actual date as minDate so no validation error
                var oMinStart = (dStart && dStart < oToday) ? dStart : oToday;
                var oMinEnd = (dEnd && dEnd < oToday) ? dEnd : oToday;

                var oStartPicker = this.byId("inWbsStartDate");
                var oEndPicker = this.byId("inWbsEndDate");
                if (oStartPicker) { oStartPicker.setMinDate(oMinStart); }
                if (oEndPicker) { oEndPicker.setMinDate(oMinEnd); }
            }
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

            // Clear minDate to avoid validation errors when viewing existing past-dated records
            var oStartPicker = this.byId("inWbsStartDate");
            var oEndPicker = this.byId("inWbsEndDate");
            if (oStartPicker) { oStartPicker.setMinDate(null); oStartPicker.setValueState("None"); }
            if (oEndPicker) { oEndPicker.setMinDate(null); oEndPicker.setValueState("None"); }
        },

        onSaveWbs: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oLocationModel = this.getView().getModel("locationModel");
            var that = this;

            var bHasLocationData = !!oLocationModel.getProperty("/LocationName");
            var sLocationId = oLocationModel.getProperty("/LocationId");

            // --- Location Validation (matching ABAP Update logic) ---
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oUserModel = this.getView().getModel("userModel");
            var oProjectData = this.getView().getModel("projectModel").getData();
            var oWbsCtx = this.getView().getBindingContext();
            var sWbsStatus = oWbsCtx ? oWbsCtx.getProperty("Status") : "";

            var bHasError = false;

            // 1. Authorization Check (ZBT_LOCATION & ZBT_WBS: AuthLevel 1 or 99)
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            var bIsAuthorized = (iAuthLevel === 1 || iAuthLevel === 99);
            if (!bIsAuthorized) {
                MessageBox.error(oBundle.getText("locationPermissionError"));
                return;
            }

            // 2. Hierarchy Status Check
            if (oProjectData.Status === "CLOSED") {
                MessageBox.error(oBundle.getText("locationEditProjectClosed"));
                return;
            }
            if (oProjectData.SiteStatus === "CLOSED") {
                MessageBox.error(oBundle.getText("locationEditSiteClosed"));
                return;
            }
            if (sWbsStatus !== "PLANNING" && sWbsStatus !== "OPEN_REJECTED") {
                MessageBox.error(oBundle.getText("wbsEditPlanningOnlyError"));
                return;
            }

            // 3. WBS Detail Field Validation
            var oInWbsName = this.byId("inWbsName");
            var oInWbsQty = this.byId("inWbsQuantity");
            var oInWbsStart = this.byId("inWbsStartDate");
            var oInWbsEnd = this.byId("inWbsEndDate");

            // Reset states
            [oInWbsName, oInWbsQty, oInWbsStart, oInWbsEnd].forEach(function (o) {
                if (o) o.setValueState("None");
            });

            var sWName = oInWbsName.getValue().trim();
            var fWQty = parseFloat(oInWbsQty.getValue());
            var dWStart = oInWbsStart.getDateValue();
            var dWEnd = oInWbsEnd.getDateValue();

            if (!sWName) {
                oInWbsName.setValueState("Error");
                oInWbsName.setValueStateText(oBundle.getText("requireWbsName"));
                bHasError = true;
            }
            if (isNaN(fWQty) || fWQty <= 0) {
                oInWbsQty.setValueState("Error");
                oInWbsQty.setValueStateText(oBundle.getText("wbsQuantityZeroError"));
                bHasError = true;
            }
            if (!dWStart) {
                oInWbsStart.setValueState("Error");
                oInWbsStart.setValueStateText(oBundle.getText("requireWbsStartDate"));
                bHasError = true;
            }
            if (!dWEnd) {
                oInWbsEnd.setValueState("Error");
                oInWbsEnd.setValueStateText(oBundle.getText("requireWbsEndDate"));
                bHasError = true;
            } else if (dWStart && dWEnd <= dWStart) {
                oInWbsEnd.setValueState("Error");
                oInWbsEnd.setValueStateText(oBundle.getText("wbsEndDateBeforeStartDateError"));
                bHasError = true;
            }

            // 4. Location Field Validation
            var oInLocName = this.byId("inLocName");
            var oInLocStart = this.byId("inLocStart");
            var oInLocEnd = this.byId("inLocEnd");
            var oInLocBot = this.byId("inLocBot");
            var oInLocTop = this.byId("inLocTop");

            var sLName = (oLocationModel.getProperty("/LocationName") || "").trim();
            if (sLName && sLName.length > 100) {
                oInLocName.setValueState("Error");
                oInLocName.setValueStateText(oBundle.getText("locationNameTooLong"));
                bHasError = true;
            }

            // POS fields: mandatory
            var sLStartVal = (oLocationModel.getProperty("/PosStart") !== null && oLocationModel.getProperty("/PosStart") !== undefined) ? String(oLocationModel.getProperty("/PosStart")).trim() : "";
            var sLEndVal = (oLocationModel.getProperty("/PosEnd") !== null && oLocationModel.getProperty("/PosEnd") !== undefined) ? String(oLocationModel.getProperty("/PosEnd")).trim() : "";
            var sLBotVal = (oLocationModel.getProperty("/PosBot") !== null && oLocationModel.getProperty("/PosBot") !== undefined) ? String(oLocationModel.getProperty("/PosBot")).trim() : "";
            var sLTopVal = (oLocationModel.getProperty("/PosTop") !== null && oLocationModel.getProperty("/PosTop") !== undefined) ? String(oLocationModel.getProperty("/PosTop")).trim() : "";



            // POS_START <= POS_END
            var fLStart = parseFloat(sLStartVal);
            var fLEnd = parseFloat(sLEndVal);
            if (!isNaN(fLStart) && !isNaN(fLEnd) && fLStart > fLEnd) {
                oInLocStart.setValueState("Error");
                oInLocStart.setValueStateText(oBundle.getText("posStartEndError"));
                bHasError = true;
            }

            // POS_BOT <= POS_TOP
            var fLBot = parseFloat(sLBotVal);
            var fLTop = parseFloat(sLTopVal);
            if (!isNaN(fLBot) && !isNaN(fLTop) && fLBot > fLTop) {
                oInLocBot.setValueState("Error");
                oInLocBot.setValueStateText(oBundle.getText("posBotTopError"));
                bHasError = true;
            }

            if (bHasError) {
                return;
            }

            var oPayloadLocation = {
                LocationName: sLName,
                PosStart: that._formatDecimal(oLocationModel.getProperty("/PosStart")),
                PosEnd: that._formatDecimal(oLocationModel.getProperty("/PosEnd")),
                PosTop: that._formatDecimal(oLocationModel.getProperty("/PosTop")),
                PosBot: that._formatDecimal(oLocationModel.getProperty("/PosBot")),
                WbsId: this._sWbsId
            };

            var fnSaveLocation = function () {
                if (!bHasLocationData) return Promise.resolve();

                return new Promise(function (resolve, reject) {
                    // WbsId is the key for LocationSet
                    var sPath = "/LocationSet(guid'" + that._sWbsId + "')";

                    // First check if it exists (for local mock logic, create if error on update)
                    oModel.update(sPath, oPayloadLocation, {
                        success: resolve,
                        error: function (vErr) {
                            // If update fails (not found), try create
                            oModel.create("/LocationSet", oPayloadLocation, {
                                success: resolve,
                                error: reject
                            });
                        }
                    });
                });
            };

            var bIsEditMode = this.getView().getModel("viewData").getProperty("/editMode");

            var fnSaveWbs = function () {
                if (!bIsEditMode) return Promise.resolve();
                return new Promise(function (resolve, reject) {
                    var sPath = "/WBSSet(guid'" + that._sWbsId + "')";

                    var toUTC = function (d) {
                        return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null;
                    };

                    var oPayloadWbs = {
                        WbsName: sWName,
                        WbsCode: oModel.getProperty(sPath + "/WbsCode"),
                        Quantity: String(Math.floor(fWQty) || "0"),
                        UnitCode: oModel.getProperty(sPath + "/UnitCode") || "M",
                        Status: oModel.getProperty(sPath + "/Status"),
                        StartDate: dWStart ? toUTC(dWStart) : oModel.getProperty(sPath + "/StartDate"),
                        EndDate: dWEnd ? toUTC(dWEnd) : oModel.getProperty(sPath + "/EndDate"),
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
                fnSaveWbs().then(function () {
                    return fnSaveLocation();
                }).then(function () {
                    MessageToast.show(oBundle.getText("updateSuccess") || "Update successful");
                    that.getView().getModel("viewData").setProperty("/editMode", false);
                    that._loadLocation(that._sWbsId);
                    if (oModel.hasPendingChanges()) {
                        oModel.resetChanges(); // Clear internal flags
                    }
                    // Force refresh to update display text mappings seamlessly
                    oModel.refresh(true);
                }).catch(function (oError) {
                    // If it's a client-side validation error (date check), stay in edit mode
                    // The inline ValueState on the DatePicker already shows the message
                    if (oError && oError.message && !oError.responseText) {
                        // Client-side error: just keep edit mode open, no MessageBox
                        return;
                    }
                    // OData/network error: show dialog and exit edit mode
                    that._showError(oError, "updateError");
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
            DependencyDelegate.init(this);

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
                isAcceptanceReportReady: false,
                editMode: false
            });
            this.getView().setModel(oViewData, "viewData");
            // --- DATE PICKER RESTRICTIONS ---
            var oDelegate = {
                onAfterRendering: function (oEvent) {
                    oEvent.srcControl.$().find("input").attr("readonly", "readonly");
                }
            };
            var oWbsStart = this.byId("inWbsStartDate");
            var oWbsEnd = this.byId("inWbsEndDate");
            if (oWbsStart) oWbsStart.addEventDelegate(oDelegate);
            if (oWbsEnd) oWbsEnd.addEventDelegate(oDelegate);
            sap.ui.getCore().getEventBus().subscribe("Global", "RefreshData", this._onGlobalRefresh, this);
        },

        onExit: function () {
            if (this._stopPolling) {
                this._stopPolling();
            }
            sap.ui.getCore().getEventBus().unsubscribe("Global", "RefreshData", this._onGlobalRefresh, this);
        },

        _onGlobalRefresh: function () {
            if (!this._sWbsId) return;
            var oBinding = this.getView().getElementBinding();
            if (oBinding) { oBinding.refresh(true); }
            this._bindDailyLogList(this._sWbsId);
            this._bindApprovalLogList(this._sWbsId);
            this._loadWorkSummary(this._sWbsId);
            this._loadLocation(this._sWbsId);
            if (this._sSiteId) { this._loadProjectInfo(this._sSiteId); }
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
            var oModel = this.getOwnerComponent().getModel();

            // Reset edit mode and models immediately to avoid stale data during navigation
            this.onCancelWbs();
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

            // Clear selections on navigation
            var oLogTable = this.byId("idDailyLogList");
            if (oLogTable) {
                oLogTable.removeSelections();
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

            // Force refresh to bypass OData entity cache on every navigation
            var oElementBinding = this.getView().getElementBinding();
            if (oElementBinding) {
                oElementBinding.refresh(true);
            }

            // Bind daily log list
            this._bindDailyLogList(sWbsId);

            // Bind approval log list
            this._bindApprovalLogList(sWbsId);

            // Load dependencies
            this._loadDependencies(sWbsId);

            // Load location info
            this._loadLocation(sWbsId);

            // Load project info
            this._loadProjectInfo(sSiteId);

            // Fetch System Date: User requested to drop backend date and use local computer date
            var oDate = new Date();
            this.getView().getModel("viewData").setProperty("/ServerDateObj", oDate);
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy HH:mm:ss" });
            this.getView().getModel("viewData").setProperty("/ServerDate", oDateFormat.format(oDate));

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

        _showError: function (oError, sDefaultI18nKey) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sMsg = sDefaultI18nKey ? (oBundle.getText(sDefaultI18nKey) || "Action failed.") : "System error occurred.";

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

            MessageBox.error(sMsg);
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
                            // Extract Latest WorkItem ID from _aGlobalLogs (already fully fetched by ApprovalLogDelegate)
                            var aGLogs = that._aGlobalLogs || [];
                            if (aGLogs.length > 0) {
                                // Sort descending by timestamp
                                var aSorted = aGLogs.slice().sort(function (a, b) {
                                    var tA = a.CreatedTimestamp ? parseInt((a.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                                    var tB = b.CreatedTimestamp ? parseInt((b.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                                    return tB - tA;
                                });
                                // Find any log with WorkItemId from current cycle
                                // IMPORTANT: WorkItemId may be on the submit row itself — capture it BEFORE breaking
                                var sGFound = null;
                                for (var gi = 0; gi < aSorted.length; gi++) {
                                    if (aSorted[gi].WorkItemId && !sGFound) {
                                        sGFound = aSorted[gi].WorkItemId;
                                    }
                                    var gAct = (aSorted[gi].Action || "").toUpperCase().trim();
                                    var bIsReset = gAct === "0000" || gAct === "SUBMITTED" || gAct === "TẠO WBS" ||
                                        (gAct.indexOf("GỬI") !== -1 && gAct.indexOf("YÊU CẦU") !== -1);
                                    if (bIsReset) break;
                                }
                                sWorkItemId = sGFound || "";
                            }
                        }

                        if (bActionable) {
                            oViewData.setProperty("/isActionableWorkSummary", true);
                            oViewData.setProperty("/activeWorkItemId", sWorkItemId);
                        }
                    },
                    error: function (oErr) {
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

            // Clear data only if navigating to a DIFFERENT WBS context
            if (oLocationModel.getProperty("/WbsId") !== sWbsId) {
                oLocationModel.setData({});
            }

            if (!sWbsId) {
                return;
            }

            this.getView().setBusy(true);
            var sPath = "/LocationSet(guid'" + sWbsId + "')";
            oModel.read(sPath, {
                success: function (oData) {
                    oLocationModel.setData(oData);
                    that.getView().setBusy(false);
                },
                error: function () {
                    oLocationModel.setData({});
                    that.getView().setBusy(false);
                }
            });
        },

        /**
         * Load project info from the configured SiteId
         */
        _loadProjectInfo: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oProjectModel = this.getView().getModel("projectModel");

            // Clear data only if navigating to a DIFFERENT Site context
            if (oProjectModel.getProperty("/SiteId") !== sSiteId) {
                oProjectModel.setData({});
            }

            if (!sSiteId) {
                return;
            }

            // Read Site to get ProjectId and SiteName, then read Project to get ProjectName
            oModel.read("/SiteSet(guid'" + sSiteId + "')", {
                success: function (oSiteData) {
                    if (oSiteData && oSiteData.ProjectId) {
                        oModel.read("/ProjectSet(guid'" + oSiteData.ProjectId + "')", {
                            success: function (oProjectData) {
                                // Combine Site info and Project info into the same model
                                oProjectData.SiteName = oSiteData.SiteName;
                                oProjectData.SiteStatus = oSiteData.Status;
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
                case "OPEN_REJECTED": return oBundle.getText("openRejectedStatus") || "Open Rejected";
                case "OPENED": return oBundle.getText("openedStatus") || "Opened";
                case "IN_PROGRESS": return oBundle.getText("inProgressStatus");
                case "PENDING_CLOSE": return oBundle.getText("pendingCloseStatus") || "Pending Close";
                case "CLOSE_REJECTED": return oBundle.getText("closeRejectedStatus") || "Close Rejected";
                case "CLOSED": return oBundle.getText("closedStatus") || "Closed";
                default: return sStatus || "";
            }
        },

        formatWbsStatusState: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "Information";
                case "PENDING_OPEN": return "Information";
                case "OPEN_REJECTED": return "Error";
                case "OPENED": return "Success";
                case "IN_PROGRESS": return "Warning";
                case "PENDING_CLOSE": return "Information";
                case "CLOSE_REJECTED": return "Error";
                case "CLOSED": return "Success";
                // Legacy
                case "NEW": return "None";
                case "INP": return "Warning";
                default: return "None";
            }
        },

        formatWbsStatusIcon: function (sStatus) {
            if (!sStatus) { return null; }
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

        formatQuantityInt: function (sValue) {
            if (!sValue) return "0";
            var f = parseFloat(sValue);
            if (isNaN(f)) return sValue;
            return String(Math.floor(f));
        },

        onLocationNameLiveChange: function (oEvent) {
            var oControl = oEvent.getSource();
            var sVal = oControl.getValue();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (sVal && sVal.length > 100) {
                oControl.setValueState("Warning");
                oControl.setValueStateText(oBundle.getText("locationNameTooLong"));
            } else {
                oControl.setValueState("None");
                oControl.setValueStateText("");
            }
        },

        onLocRangeChange: function (oEvent) {
            oEvent.getSource().setValueState("None");
        },

        /**
         * Formatter: "Số: NT-{0}" + WbsCode
         * Used in AcceptanceReport to replace sap.ui.model.type.MessageFormat
         */
        formatReportNo: function (sTemplate, sWbsCode) {
            if (!sTemplate) return "";
            return sTemplate.replace("{0}", sWbsCode || "");
        },

        /**
         * Formatter: "(Giai đoạn: {0} - {1})" with date objects
         * Used in AcceptanceReport to replace sap.ui.model.type.MessageFormat
         */
        formatPeriod: function (sTemplate, dStart, dEnd) {
            if (!sTemplate) return "";
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
            var sStart = dStart ? oDateFormat.format(dStart instanceof Date ? dStart : new Date(dStart)) : "—";
            var sEnd = dEnd ? oDateFormat.format(dEnd instanceof Date ? dEnd : new Date(dEnd)) : "—";
            return sTemplate.replace("{0}", sStart).replace("{1}", sEnd);
        },
    });

    // Mix in DependencyDelegate functions
    Object.assign(WBSDetailController.prototype, {
        _loadDependencies: DependencyDelegate._loadDependencies,
        onAddDependency: DependencyDelegate.onAddDependency,
        onConfirmAddDependency: DependencyDelegate.onConfirmAddDependency,
        onCancelAddDependency: DependencyDelegate.onCancelAddDependency,
        onDeleteDependency: DependencyDelegate.onDeleteDependency,
        formatDepType: DependencyDelegate.formatDepType,
        formatDepTypeState: DependencyDelegate.formatDepTypeState,
        validateDependencyOnRun: DependencyDelegate.validateDependencyOnRun,
        validateDependencyOnClose: DependencyDelegate.validateDependencyOnClose
    });

    // Mix in DailyLogDelegate functions
    Object.assign(WBSDetailController.prototype, {
        resetLogDetailState: DailyLogDelegate.resetLogDetailState,
        _bindDailyLogList: DailyLogDelegate._bindDailyLogList,
        onLogItemSelect: DailyLogDelegate.onLogItemSelect,
        onLogRowPress: DailyLogDelegate.onLogRowPress,
        _showLogDetail: DailyLogDelegate._showLogDetail,
        _loadResourceUse: DailyLogDelegate._loadResourceUse,
        onAddLog: DailyLogDelegate.onAddLog,
        _proceedToAddLog: DailyLogDelegate._proceedToAddLog,
        onExportExcel: DailyLogDelegate.onExportExcel,
        onDownloadTemplate: DailyLogDelegate.onDownloadTemplate,
        onImportExcel: DailyLogDelegate.onImportExcel,
        _openImportPreviewDialog: DailyLogDelegate._openImportPreviewDialog,
        onImportPreviewSelectAll: DailyLogDelegate.onImportPreviewSelectAll,
        onImportPreviewDeselectAll: DailyLogDelegate.onImportPreviewDeselectAll,
        onConfirmImport: DailyLogDelegate.onConfirmImport,
        onCancelImport: DailyLogDelegate.onCancelImport,
        formatImportDate: DailyLogDelegate.formatImportDate,
        formatWeather: DailyLogDelegate.formatWeather,
        formatTotalResQty: DailyLogDelegate.formatTotalResQty,
        formatImportPreviewLogCount: DailyLogDelegate.formatImportPreviewLogCount,
        _importLogsSequentially: DailyLogDelegate._importLogsSequentially,
        onDeleteLog: DailyLogDelegate.onDeleteLog,
        onDeleteMultipleLogs: DailyLogDelegate.onDeleteMultipleLogs,
        onToggleEditMode: DailyLogDelegate.onToggleEditMode,
        onCancelEdit: DailyLogDelegate.onCancelEdit,
        onAddResourceUse: DailyLogDelegate.onAddResourceUse,
        onDeleteResourceUse: DailyLogDelegate.onDeleteResourceUse,
        _getResourceApiModel: DailyLogDelegate._getResourceApiModel,
        _normalizeResourceMaster: DailyLogDelegate._normalizeResourceMaster,
        _readResourceMasterList: DailyLogDelegate._readResourceMasterList,
        _filterResourceValueHelpItems: DailyLogDelegate._filterResourceValueHelpItems,
        _applyResourceInfoToRow: DailyLogDelegate._applyResourceInfoToRow,
        _applyAndMergeResourceInfo: DailyLogDelegate._applyAndMergeResourceInfo,
        _openResourceIdValueHelp: DailyLogDelegate._openResourceIdValueHelp,
        onResourceIdValueHelpRequest: DailyLogDelegate.onResourceIdValueHelpRequest,
        onResourceIdChange: DailyLogDelegate.onResourceIdChange,
        onQuantityChange: DailyLogDelegate.onQuantityChange,
        onSaveLog: DailyLogDelegate.onSaveLog,
        _persistLog: DailyLogDelegate._persistLog,
        _saveResourceUse: DailyLogDelegate._saveResourceUse,
        _updateWbsActualDates: DailyLogDelegate._updateWbsActualDates,
        _verifyStatusForDailyLog: DailyLogDelegate._verifyStatusForDailyLog,
        onCancelLog: DailyLogDelegate.onCancelLog
    });

    // Mix in WorkSummaryDelegate functions to the controller prototype so XML views can resolve them during parsing
    Object.assign(WBSDetailController.prototype, {
        _loadWorkSummary: WorkSummaryDelegate._loadWorkSummary,
        formatQtyPercentageStr: WorkSummaryDelegate.formatQtyPercentageStr,
        formatQtyProgressPercent: WorkSummaryDelegate.formatQtyProgressPercent,
        formatQtyProgressState: WorkSummaryDelegate.formatQtyProgressState,
        formatQtyProgressDisplay: WorkSummaryDelegate.formatQtyProgressDisplay,
        formatQuantityState: WorkSummaryDelegate.formatQuantityState,
        formatPercentage: WorkSummaryDelegate.formatPercentage,
        formatProgress: WorkSummaryDelegate.formatProgress,
        formatTimeElapsedDisplay: WorkSummaryDelegate.formatTimeElapsedDisplay,
        formatTimeElapsedPercent: WorkSummaryDelegate.formatTimeElapsedPercent,
        formatTimeElapsedPercentStr: WorkSummaryDelegate.formatTimeElapsedPercentStr,
        formatTimeElapsedState: WorkSummaryDelegate.formatTimeElapsedState,
        formatPerformancePanelVisible: WorkSummaryDelegate.formatPerformancePanelVisible,
        formatTotalQty: WorkSummaryDelegate.formatTotalQty,
        formatWorkSummaryStatusState: WorkSummaryDelegate.formatWorkSummaryStatusState,
        formatWorkSummaryStatusIcon: WorkSummaryDelegate.formatWorkSummaryStatusIcon,
        formatPlanDateRange: WorkSummaryDelegate.formatPlanDateRange,
        formatPlanDuration: WorkSummaryDelegate.formatPlanDuration,
        formatActualDateRange: WorkSummaryDelegate.formatActualDateRange,
        formatActualDuration: WorkSummaryDelegate.formatActualDuration,
        formatActualDurationState: WorkSummaryDelegate.formatActualDurationState,
        onSubmitForApproval: WorkSummaryDelegate.onSubmitForApproval,
        formatStepClass: WorkSummaryDelegate.formatStepClass,
        formatStepLabelClass: WorkSummaryDelegate.formatStepLabelClass,
        formatStepLineClass: WorkSummaryDelegate.formatStepLineClass,
        formatStepIcon: WorkSummaryDelegate.formatStepIcon,
        formatStepLabel: WorkSummaryDelegate.formatStepLabel,
        formatStepNumber: WorkSummaryDelegate.formatStepNumber,
        formatStepNumberVisible: WorkSummaryDelegate.formatStepNumberVisible,
        formatCompletionRateTitle: WorkSummaryDelegate.formatCompletionRateTitle,
        formatAverageProductivity: WorkSummaryDelegate.formatAverageProductivity,
        formatScheduleVarianceText: WorkSummaryDelegate.formatScheduleVarianceText,
        formatScheduleVarianceState: WorkSummaryDelegate.formatScheduleVarianceState,
        formatScheduleVarianceIcon: WorkSummaryDelegate.formatScheduleVarianceIcon,
        formatForecastDateText: WorkSummaryDelegate.formatForecastDateText,
        formatRiskAssessmentText: WorkSummaryDelegate.formatRiskAssessmentText,
        formatRiskAssessmentState: WorkSummaryDelegate.formatRiskAssessmentState,
        onPressViewFullLogHistory: WorkSummaryDelegate.onPressViewFullLogHistory,
        onSearchFullLogHistory: WorkSummaryDelegate.onSearchFullLogHistory,
        onCloseFullLogHistory: WorkSummaryDelegate.onCloseFullLogHistory,
        onPressChildWbs: WorkSummaryDelegate.onPressChildWbs,
        formatPlanQtyDisplay: WorkSummaryDelegate.formatPlanQtyDisplay,
        formatPlanQtyPercent: WorkSummaryDelegate.formatPlanQtyPercent,
        formatPlanQtyPercentStr: WorkSummaryDelegate.formatPlanQtyPercentStr
    });

    // Mix in ApprovalLogDelegate functions to the controller prototype
    Object.assign(WBSDetailController.prototype, {
        onLogSelectionChange: ApprovalLogDelegate.onLogSelectionChange,
        onApprovalLogPress: ApprovalLogDelegate.onApprovalLogPress,
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
            if (sStatus !== "IN_PROGRESS" && sStatus !== "CLOSE_REJECTED") {
                var oBundle = this.getView().getModel("i18n").getResourceBundle();
                sap.m.MessageBox.error(oBundle.getText("inProgressOnlyCloseApprovalError", [""]) || "Hạng mục phải ở trạng thái 'In Progress' hoặc 'Close Rejected' mới có thể gửi phê duyệt đóng.");
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
            if (sStatus !== "PLANNING" && sStatus !== "OPEN_REJECTED") {
                sap.m.MessageBox.error(oBundle.getText("planningOnlyOpenApprovalError", [""]) || "Hạng mục phải ở trạng thái 'Planning' hoặc 'Open Rejected' mới có thể gửi phê duyệt mở.");
                return;
            }

            sap.m.MessageBox.confirm(oBundle.getText("submitOpenApprovalConfirm", ["1"]), {
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        oView.setBusy(true);
                        that.getOwnerComponent().getModel().callFunction("/ApproveWbs", {
                            method: "POST",
                            urlParameters: { WbsIds: oWbsCtx.getProperty("WbsId"), ApprovalType: "OPEN" },
                            success: function (oData) {
                                oView.setBusy(false);
                                that.getOwnerComponent().getModel().refresh(true, true);

                                var aResults = oData.results || (oData.ApproveWbs && oData.ApproveWbs.results) || [];
                                if (aResults && aResults.length > 0) {
                                    var oFirstResult = aResults[0];
                                    if (oFirstResult.ReturnType === "E") {
                                        sap.m.MessageBox.error(oFirstResult.Message || "Error on submission.");
                                    } else if (oFirstResult.ReturnType === "W") {
                                        sap.m.MessageBox.warning(oFirstResult.Message || "Warning on submission.");
                                    } else {
                                        sap.m.MessageToast.show(oFirstResult.Message || oBundle.getText("submitSuccess", ["1"]));
                                    }
                                } else {
                                    sap.m.MessageToast.show(oBundle.getText("submitSuccess", ["1"]));
                                }
                            },
                            error: function (oError) {
                                oView.setBusy(false);
                                var sMsg = oBundle.getText("wbsSubmitError") || "Error on submission.";
                                try {
                                    var oErr = JSON.parse(oError.responseText);
                                    sMsg = oErr.error.message.value || sMsg;
                                } catch (e) { }
                                sap.m.MessageBox.error(sMsg);
                            }
                        });
                    }
                }
            });
        },

        onApproveOpenWorkSummary: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._submitOpenDecision("0001", oBundle.getText("approveOpen"));
        },

        onRejectOpenWorkSummary: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._submitOpenDecision("0002", oBundle.getText("rejectOpen"));
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
                                    var oResult = oData.PostDecision || oData;
                                    if (oResult && oResult.SUCCESS === false) {
                                        sap.m.MessageBox.error(oResult.MESSAGE || "Lưu quyết định thất bại.");
                                    } else {
                                        sap.m.MessageBox.success(oBundle.getText("processSuccess", ["1"]));
                                        // Clear the WorkItemId so subsequent clicks force a new CheckDecision
                                        oViewData.setProperty("/activeWorkItemId", null);
                                        that.getOwnerComponent().getModel().refresh(true, true);
                                    }
                                },
                                error: function (oError) {
                                    oView.setBusy(false);
                                    var sMsg = oBundle.getText("processError") || "Error processing decision.";
                                    try {
                                        var oErr = JSON.parse(oError.responseText);
                                        sMsg = oErr.error.message.value || sMsg;
                                    } catch (e) { }
                                    sap.m.MessageBox.error(sMsg);
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
                            var sFallbackMsg = oBundle.getText("workItemIdNotFoundError") || "Hạng mục này đã được xử lý hoặc bạn không có quyền duyệt.";
                            // Optional: Extract specific dynamic content (like "LEARN-552") from backend message if possible
                            var sBackendMsg = (oResult && oResult.MESSAGE) ? oResult.MESSAGE : "";
                            var aMatches = sBackendMsg.match(/(LEARN-\d+)/);
                            if (aMatches && aMatches.length > 1) {
                                sFallbackMsg += " (" + aMatches[1] + ")";
                            }
                            sap.m.MessageBox.information(sFallbackMsg);
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
                        var sEvalRes = "";

                        // Force WbsId and ApprovalType filter natively because backend sometimes ignores the API filter
                        var aLogs = aAllLogs.filter(function (log) {
                            return log.WbsId && log.WbsId.toLowerCase() === sWbsId.toLowerCase() && log.ApprovalType === "CLOSE";
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

                        // Force View Mode if closed or rejected
                        if (oWbs && (oWbs.Status === "CLOSED" || oWbs.Status === "CLOSE_REJECTED")) {
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

                            // Safely convert EvaluationResult to string to avoid strict equality failure if it's an integer
                            var sLogEval = String(log.EvaluationResult || "").trim();
                            if (!sEvalRes && (sLogEval === "1" || sLogEval === "2")) {
                                sEvalRes = sLogEval;
                            }

                            var sAction = (log.Action || "").toUpperCase().trim();
                            var iLevel = parseInt(log.ApprovalLevel) || 0;

                            // Extract WorkItemId directly from logs if CheckDecision didn't provide one.
                            if (log.WorkItemId) {
                                if (!sFoundWorkItemId) sFoundWorkItemId = log.WorkItemId;
                                if (sAction.indexOf("ĐÃ NHẬN YÊU CẦU") !== -1 && iLevel === myAuthLevel) {
                                    sFoundWorkItemId = log.WorkItemId;
                                }
                            }

                            // Ignore informational routing logs from Workflow
                            if (sAction.indexOf("ĐÃ CHUYỂN LUỒNG") !== -1 || sAction.indexOf("ĐÃ NHẬN YÊU CẦU") !== -1 || sAction.indexOf("CẬP NHẬT TRẠNG THÁI") !== -1) {
                                return;
                            }

                            // Identify Submit actions (cycle start).
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
                            if (sAction.indexOf("DUYỆT") !== -1 && sAction.indexOf("CHẤM DỨT") === -1) {
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
                        oViewData.setProperty("/evaluationResult", sEvalRes);

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
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._submitDecisionFromReport("0001", oBundle.getText("approve"));
        },

        onRejectFromReport: function () {
            var that = this;
            var oView = this.getView();
            var oBundle = oView.getModel("i18n").getResourceBundle();
            var oViewData = oView.getModel("viewData");
            var oActiveWbs = oViewData.getProperty("/activeWbs");

            if (!oActiveWbs || !oActiveWbs.WorkItemId) {
                MessageBox.error(oBundle.getText("workItemIdNotFoundError") || "Không tìm thấy mã công việc (WorkItemId) để xử lý.");
                return;
            }

            // Build a dialog with a mandatory TextArea for rejection reason
            var oTextArea = new sap.m.TextArea({
                width: "100%",
                rows: 4,
                placeholder: oBundle.getText("rejectNotePlaceholder") || "Nhập lý do từ chối...",
                liveChange: function (oEvent) {
                    var sVal = oEvent.getParameter("value").trim();
                    oRejectDialog.getBeginButton().setEnabled(sVal.length > 0);
                    oEvent.getSource().setValueState(sVal.length > 0 ? "None" : "Error");
                }
            });
            oTextArea.setValueState("Error");
            oTextArea.setValueStateText(oBundle.getText("rejectNoteRequired") || "Bắt buộc nhập lý do từ chối.");

            var oRejectDialog = new sap.m.Dialog({
                title: oBundle.getText("rejectTitle") || "Từ chối nghiệm thu",
                type: "Message",
                contentWidth: "400px",
                content: [
                    new sap.m.Label({ text: oBundle.getText("rejectNoteLabel") || "Lý do từ chối:", required: true }),
                    oTextArea
                ],
                beginButton: new sap.m.Button({
                    text: oBundle.getText("confirmReject") || "Xác nhận Từ chối",
                    type: "Reject",
                    enabled: false,
                    press: function () {
                        var sNote = oTextArea.getValue().trim();
                        oRejectDialog.close();
                        that._submitDecisionFromReport("0002", oBundle.getText("reject"), sNote);
                    }
                }),
                endButton: new sap.m.Button({
                    text: oBundle.getText("cancel") || "Hủy",
                    press: function () {
                        oRejectDialog.close();
                    }
                }),
                afterClose: function () {
                    oRejectDialog.destroy();
                }
            });

            oView.addDependent(oRejectDialog);
            oRejectDialog.open();
        },

        _submitDecisionFromReport: function (sDecisionCode, sTitle, sNote) {
            var that = this;
            var oView = this.getView();
            var oModel = this.getOwnerComponent().getModel();
            var oViewData = oView.getModel("viewData");
            var oActiveWbs = oViewData.getProperty("/activeWbs");

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (!oActiveWbs || !oActiveWbs.WorkItemId) {
                MessageBox.error(oBundle.getText("workItemIdNotFoundError") || "Không tìm thấy mã công việc (WorkItemId) để xử lý.");
                return;
            }

            var fnExecute = function () {
                var sEvalResult = "";
                if (sDecisionCode === "0001") sEvalResult = "1";
                if (sDecisionCode === "0002") sEvalResult = "2";

                oView.setBusy(true);
                oModel.callFunction("/PostDecision", {
                    method: "POST",
                    urlParameters: {
                        WI_ID: oActiveWbs.WorkItemId,
                        Decision: sDecisionCode,
                        Note: sNote || "Processed from Acceptance Report",
                        EvaluationResult: sEvalResult
                    },
                    success: function (oData) {
                        oView.setBusy(false);
                        if (typeof that.onCloseAcceptanceDialog === "function") {
                            that.onCloseAcceptanceDialog();
                        }
                        MessageBox.success(oBundle.getText("processSuccess", ["1"]) || "Đã xử lý quyết định thành công.");
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
            };

            // For approve, show a confirmation dialog; for reject, note was already collected
            if (sDecisionCode === "0001") {
                MessageBox.confirm(oBundle.getText("decisionConfirm", [sTitle]) || "Bạn có chắc chắn muốn thực hiện " + sTitle + " cho hạng mục này?", {
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            fnExecute();
                        }
                    }
                });
            } else {
                // Reject: note already provided, execute directly
                fnExecute();
            }
        },

        onPressSubmitOpenWorkSummary: function () {
            var that = this;
            var oView = this.getView();
            var oWbsCtx = oView.getBindingContext();
            if (!oWbsCtx) return;

            var sStatus = oWbsCtx.getProperty("Status");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (sStatus !== "PLANNING" && sStatus !== "OPEN_REJECTED") {
                sap.m.MessageBox.error(oBundle.getText("planningOnlyOpenApprovalError", [""]) || "Hạng mục phải ở trạng thái 'Planning' hoặc 'Open Rejected' mới có thể gửi phê duyệt mở.");
                return;
            }

            sap.m.MessageBox.confirm(oBundle.getText("submitOpenApprovalConfirm", ["1"]), {
                title: oBundle.getText("confirmation") || "Xác nhận",
                onClose: function (sAction) {
                    if (sAction === sap.m.MessageBox.Action.OK) {
                        oView.setBusy(true);
                        that.getOwnerComponent().getModel().callFunction("/ApproveWbs", {
                            method: "POST",
                            urlParameters: { WbsIds: oWbsCtx.getProperty("WbsId"), ApprovalType: "OPEN" },
                            success: function (oData) {
                                oView.setBusy(false);
                                that.getOwnerComponent().getModel().refresh(true, true);

                                var aResults = oData.results || (oData.ApproveWbs && oData.ApproveWbs.results) || [];
                                if (aResults && aResults.length > 0) {
                                    var oFirstResult = aResults[0];
                                    if (oFirstResult.ReturnType === "E") {
                                        sap.m.MessageBox.error(oFirstResult.Message || "Error on submission.");
                                    } else if (oFirstResult.ReturnType === "W") {
                                        sap.m.MessageBox.warning(oFirstResult.Message || "Warning on submission.");
                                    } else {
                                        sap.m.MessageToast.show(oFirstResult.Message || oBundle.getText("submitSuccess", ["1"]));
                                    }
                                } else {
                                    sap.m.MessageToast.show(oBundle.getText("submitSuccess", ["1"]));
                                }
                            },
                            error: function (oError) {
                                oView.setBusy(false);
                                var sMsg = oBundle.getText("wbsSubmitError") || "Error on submission.";
                                try {
                                    var oErr = JSON.parse(oError.responseText);
                                    sMsg = oErr.error.message.value || sMsg;
                                } catch (e) { }
                                sap.m.MessageBox.error(sMsg);
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

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (sStatus === "PENDING_OPEN") {
                sap.m.MessageBox.error(oBundle.getText("wbsPendingOpenError") || "This item is pending open.");
                return;
            }

            if (sStatus === "CLOSED") {
                sap.m.MessageBox.information(oBundle.getText("wbsClosedInfo") || "This item is closed.");
                return;
            }

            if (sStatus !== "PLANNING" && sStatus !== "OPEN_REJECTED") {
                sap.m.MessageBox.warning(oBundle.getText("planningOnlyOpenApprovalError", [""]) || "Chỉ những hạng mục ở trạng thái 'Planning' hoặc bị từ chối mở mới có thể gửi phê duyệt mở.");
                return;
            }

            var sWbsId = this._sWbsId;
            var oModel = this.getOwnerComponent().getModel();

            this.onCloseWbsInfoDialog();
            oView.setBusy(true);

            // --- NEW API CODE ---
            oModel.callFunction("/ApproveWbs", {
                method: "POST",
                urlParameters: {
                    WbsIds: sWbsId,
                    ApprovalType: "OPEN"
                },
                success: function (oData) {
                    oView.setBusy(false);
                    oModel.refresh(true, true);

                    var aResults = oData.results || (oData.ApproveWbs && oData.ApproveWbs.results) || [];
                    if (aResults && aResults.length > 0) {
                        var oFirstResult = aResults[0];
                        if (oFirstResult.ReturnType === "E") {
                            sap.m.MessageBox.error(oFirstResult.Message || "Error on submission.");
                        } else if (oFirstResult.ReturnType === "W") {
                            sap.m.MessageBox.warning(oFirstResult.Message || "Warning on submission.");
                        } else {
                            sap.m.MessageBox.success(oFirstResult.Message || oBundle.getText("submitSuccess", ["1"]));
                        }
                    } else {
                        sap.m.MessageBox.success(oBundle.getText("submitSuccess", ["1"]));
                    }
                },
                error: function (oError) {
                    oView.setBusy(false);
                    var sMsg = oBundle.getText("wbsSubmitError") || "Error on submission.";
                    try {
                        var oErr = JSON.parse(oError.responseText);
                        if (oErr.error && oErr.error.message && oErr.error.message.value) {
                            sMsg = oErr.error.message.value;
                        }
                    } catch (e) { }
                    sap.m.MessageBox.error(sMsg);
                }
            });
            // --- END NEW API CODE ---
        }
    });

    return WBSDetailController;
});