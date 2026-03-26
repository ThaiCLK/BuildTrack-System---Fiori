sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "z/bts/buildtrack551/controller/delegate/WBSDelegate",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/DatePicker",
    "sap/m/TextArea",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/layout/form/SimpleForm",
    "z/bts/buildtrack551/controller/delegate/WorkSummaryDelegate",
    "sap/ui/core/Fragment",
    "z/bts/buildtrack551/controller/delegate/ApprovalLogDelegate"
], function (Controller, WBSDelegate, JSONModel, DateFormat,
    MessageToast, MessageBox, Dialog, Button, Label, Input,
    Select, Item, DatePicker, TextArea, Filter, FilterOperator, SimpleForm, WorkSummaryDelegate, Fragment, ApprovalLogDelegate) {
    "use strict";

    var SiteDetailController = Controller.extend("z.bts.buildtrack551.controller.SiteDetail", {

        _getResourceBundle: function () {
            var oView = this.getView();
            var oModel = oView ? oView.getModel("i18n") : null;
            if (!oModel) {
                oModel = this.getOwnerComponent().getModel("i18n");
            }
            return oModel ? oModel.getResourceBundle() : null;
        },

        formatSiteDetailTitle: function (sSiteName) {
            var oBundle = this._getResourceBundle();
            return oBundle ? oBundle.getText("siteDetailTitle", [sSiteName || ""]) : sSiteName;
        },

        formatStatusText: function (sStatus) {
            var oBundle = this._getResourceBundle();
            if (!oBundle) { return sStatus; }
            var m = {
                "PLANNING": oBundle.getText("planningStatus"),
                "SUBMITTED": oBundle.getText("submittedStatus"),
                "REJECTED": oBundle.getText("rejectedStatus"),
                "READY": oBundle.getText("readyStatus"),
                "IN_PROGRESS": oBundle.getText("inProgressStatus"),
                "COMPLETED": oBundle.getText("completedStatus")
            };
            return m[(sStatus || "").toUpperCase()] || sStatus;
        },

        formatWbsStatusText: function (sStatus) {
            var oBundle = this._getResourceBundle();
            if (!oBundle) { return sStatus; }
            var m = {
                "PLANNING": oBundle.getText("planningStatus"),
                "SUBMITTED": oBundle.getText("submittedStatus"),
                "REJECTED": oBundle.getText("rejectedStatus"),
                "READY": oBundle.getText("readyStatus"),
                "IN_PROGRESS": oBundle.getText("inProgressStatus"),
                "COMPLETED": oBundle.getText("completedStatus"),
                "PENDING_OPEN": oBundle.getText("pendingOpenStatus") || "Pending Open",
                "PENDING_CLOSE": oBundle.getText("pendingCloseStatus") || "Pending Close",
                "OPENED": oBundle.getText("openedStatus") || "Opened",
                "CLOSED": oBundle.getText("closedStatus") || "Closed"
            };
            return m[(sStatus || "").toUpperCase()] || sStatus;
        },


        onInit: function () {
            this._oWBSDelegate = new WBSDelegate(this);
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("SiteDetail").attachPatternMatched(this._onObjectMatched, this);
            this.getView().setModel(new JSONModel({
                WBS: [],
                pendingWBS: [],
                pendingOpenWBS: [],
                pendingCloseWBS: [],
                editMode: false
            }), "viewData");
            this.getView().setModel(new JSONModel(), "viewConfig");
            // Init Delegates & Models for Acceptance Report
            WorkSummaryDelegate.init(this);
            ApprovalLogDelegate.init(this);
            this.getView().setModel(new JSONModel({}), "locationModel");
            this.getView().setModel(new JSONModel({}), "workSummaryModel");
            this.getView().setModel(new JSONModel({}), "projectModel");

            // --- AUTO REFRESH LOGIC ---
            this._fnFocusHandler = function () {
                if (this._sCurrentSiteId) {
                    this._loadWbsData();
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

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            if (sKey === "approvalTab") {
                this._startPolling();
            } else {
                this._stopPolling();
            }
        },

        _startPolling: function () {
            this._stopPolling(); // clear existing if any
            this._iPollingInterval = setInterval(function () {
                if (this._sCurrentSiteId) {
                    this._loadWbsData();
                }
            }.bind(this), 10000); // Poll every 10 seconds
        },

        _stopPolling: function () {
            if (this._iPollingInterval) {
                clearInterval(this._iPollingInterval);
                this._iPollingInterval = null;
            }
        },

        onNavToDashboard: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        /* =========================================================== */
        /* INLINE EDIT MODE - SITE GENERAL INFO                        */
        /* =========================================================== */
        onEditSite: function () {
            this.getView().getModel("viewData").setProperty("/editMode", true);
        },

        onCancelSite: function () {
            this.getView().getModel("viewData").setProperty("/editMode", false);
            // Revert unsaved UI field changes synced into the local shadow context of Two-Way Model
            var oModel = this.getOwnerComponent().getModel();
            if (oModel.hasPendingChanges()) {
                oModel.resetChanges();
            }
        },

        onSaveSite: function () {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var sPath = "/SiteSet(guid'" + this._sCurrentSiteId + "')";
            var bIsEditMode = this.getView().getModel("viewData").getProperty("/editMode");

            if (!bIsEditMode) {
                return;
            }

            var oPayload = {
                SiteCode: this.byId("inSiteCode").getValue(),
                Address: this.byId("inSiteAddress").getValue(),
                Status: this.byId("inSiteStatus").getSelectedKey(),
                SiteName: this.byId("inSiteName").getValue(),
                Client: oModel.getProperty(sPath + "/Client"),
                ProjectId: oModel.getProperty(sPath + "/ProjectId")
            };

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            oModel.update(sPath, oPayload, {
                success: function () {
                    MessageToast.show(oBundle.getText("siteUpdateSuccess"));
                    that.getView().getModel("viewData").setProperty("/editMode", false);
                    if (oModel.hasPendingChanges()) { oModel.resetChanges(); }
                    oModel.refresh(true);
                },
                error: function () {
                    MessageBox.error(oBundle.getText("siteUpdateError"));
                    that.getView().getModel("viewData").setProperty("/editMode", false);
                    if (oModel.hasPendingChanges()) { oModel.resetChanges(); }
                }
            });
        },

        onNavBack: function () {
            // Check if there is a previous history entry
            var oHistory = sap.ui.core.routing.History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
        },

        _onObjectMatched: function (oEvent) {
            var sSiteId = oEvent.getParameter("arguments").site_id;
            this._sCurrentSiteId = sSiteId;
            var that = this;

            this.getView().bindElement({
                path: "/SiteSet(guid'" + sSiteId + "')",
                events: {
                    dataRequested: function () { that.getView().setBusy(true); },
                    dataReceived: function () { that.getView().setBusy(false); }
                }
            });

            this._loadWbsData();
        },

        _loadWbsData: function () {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            oModel.read("/SiteSet(guid'" + this._sCurrentSiteId + "')/ToWbs", {
                urlParameters: {
                    "$expand": "ToSubWbs,ToSubWbs/ToApprovalLog,ToApprovalLog",
                    "$orderby": "WbsCode"
                },
                success: function (oData) {
                    var aRawResults = oData.results || [];

                    // Flatten hierarchical results from $expand=ToSubWbs if they aren't already part of the flat results set
                    var aResults = [];
                    var mSeen = {};
                    var fnFlatten = function (aItems) {
                        if (!aItems) return;
                        aItems.forEach(function (oItem) {
                            if (!mSeen[oItem.WbsId]) {
                                aResults.push(oItem);
                                mSeen[oItem.WbsId] = true;
                            }
                            if (oItem.ToSubWbs && oItem.ToSubWbs.results) {
                                fnFlatten(oItem.ToSubWbs.results);
                            }
                        });
                    };
                    fnFlatten(aRawResults);

                    var aTreeData = that._transformToTree(aResults);
                    var oGanttConfig = that._oWBSDelegate.prepareGanttData(aTreeData);
                    that.getView().getModel("viewData").setProperty("/WBS", aTreeData);
                    that.getView().getModel("viewConfig").setData(oGanttConfig);


                    // 1. Filter items that are globally in a PENDING status
                    var aGlobalPending = aResults.filter(function (item) {
                        return item.Status === "PENDING_OPEN" || item.Status === "PENDING_CLOSE";
                    });


                    if (aGlobalPending.length === 0) {
                        that.getView().getModel("viewData").setProperty("/pendingWBS", []);
                        return;
                    }

                    // 2. Perform user-specific check for each pending item
                    var aUserActionableItems = [];
                    var iProcessed = 0;

                    aGlobalPending.forEach(function (oItem) {
                        var sType = "OPEN";
                        var aLogs = (oItem.ToApprovalLog && oItem.ToApprovalLog.results) ? oItem.ToApprovalLog.results : [];

                        if (aLogs.length > 0) {
                            // Sort by CreatedTimestamp (String comparison works if format is YYYYMMDD...)
                            aLogs.sort(function (a, b) {
                                if (a.CreatedTimestamp < b.CreatedTimestamp) return 1;
                                if (a.CreatedTimestamp > b.CreatedTimestamp) return -1;
                                return 0;
                            });
                            sType = aLogs[0].ApprovalType || "OPEN";
                        } else if (oItem.Status && oItem.Status.indexOf("CLOSE") !== -1) {
                            sType = "CLOSE";
                        }


                        oModel.callFunction("/CheckDecision", {
                            method: "POST",
                            urlParameters: {
                                WBS_IDS: oItem.WbsId,
                                ApprovalType: sType
                            },
                            changeSetId: oItem.WbsId, // Ensure separate changeset per item
                            success: function (oResponse) {

                                // Robust check: CheckDecision returns an object with WORKITEM_ID
                                var oResult = oResponse.CheckDecision;
                                if (oResult === undefined && oResponse.results) {
                                    oResult = oResponse.results.CheckDecision;
                                }

                                var bActionable = false;
                                if (oResult && oResult.WORKITEM_ID && oResult.WORKITEM_ID !== "" && oResult.WORKITEM_ID !== "000000000000") {
                                    bActionable = true;

                                    // Extract Approval Level for Title display
                                    var aLogs = (oItem.ToApprovalLog && oItem.ToApprovalLog.results) ? oItem.ToApprovalLog.results : [];
                                    var oTargetLog = aLogs.find(function (log) {
                                        return log.WorkItemId === oResult.WORKITEM_ID;
                                    });
                                    if (oTargetLog && oTargetLog.ApprovalLevel) {
                                        that.getView().getModel("viewData").setProperty("/userLevel", oTargetLog.ApprovalLevel);
                                    }
                                } else if (oResult == 1 || oResult == "1") {
                                    bActionable = true;
                                }

                                if (bActionable) {
                                    oItem.WorkItemId = oResult.WORKITEM_ID; // Store for PostDecision

                                    // Identify current user's approval level for this item
                                    var currentLevel = 0;
                                    var aLogs = (oItem.ToApprovalLog && oItem.ToApprovalLog.results) ? oItem.ToApprovalLog.results : [];
                                    var oTargetLog = aLogs.find(function (log) {
                                        return log.WorkItemId === oResult.WORKITEM_ID;
                                    });
                                    if (oTargetLog) {
                                        currentLevel = oTargetLog.ApprovalLevel;
                                    }
                                    oItem.UserLevel = currentLevel;

                                    aUserActionableItems.push(oItem);
                                } else {
                                }

                                iProcessed++;
                                if (iProcessed === aGlobalPending.length) {
                                    // Split into Open and Close
                                    var aOpen = aUserActionableItems.filter(function (w) { return w.Status.indexOf("OPEN") !== -1; });
                                    var aClose = aUserActionableItems.filter(function (w) { return w.Status.indexOf("CLOSE") !== -1; });

                                    var oViewData = that.getView().getModel("viewData");
                                    oViewData.setProperty("/pendingOpenWBS", aOpen);
                                    oViewData.setProperty("/pendingCloseWBS", aClose);
                                    oViewData.setProperty("/pendingWBS", aUserActionableItems); // Fallback

                                }
                            },
                            error: function (oError) {
                                iProcessed++;
                                if (iProcessed === aGlobalPending.length) {
                                    that.getView().getModel("viewData").setProperty("/pendingWBS", aUserActionableItems);
                                }
                            }
                        });
                    });
                },
                error: function (oError) { console.error("Error reading WBSSet:", oError); }
            });
        },

        onNavBack: function () {
            var oCtx = this.getView().getBindingContext();
            var sProjectId = oCtx ? oCtx.getProperty("ProjectId") : "";
            if (sProjectId) {
                this.getOwnerComponent().getRouter().navTo("Site", { project_id: sProjectId }, true);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
        },

        // ── WBS: CREATE (root if no row selected, child if row selected) ────────
        onAddWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length > 1) {
                MessageToast.show(oBundle.getText("selectOneChildWbsError"));
                return;
            }

            if (aIndices.length === 1) {
                // A row is selected → create as child of that row
                var oCtx = oTable.getContextByIndex(aIndices[0]);
                var sParentId = oCtx ? oCtx.getProperty("WbsId") : null;
                var sParentName = oCtx ? oCtx.getProperty("WbsName") : "";

                // Prevent creating grandchildren (i.e. if the selected row is already a child)
                var sSelectedRowParentId = oCtx ? oCtx.getProperty("ParentId") : null;
                if (sSelectedRowParentId && sSelectedRowParentId !== "00000000-0000-0000-0000-000000000000") {
                    var oBundle = this.getView().getModel("i18n").getResourceBundle();
                    sap.m.MessageBox.warning(oBundle.getText("cannotAddSubWbsError"));
                    return;
                }

                this._openWbsDialog(null, sParentId, sParentName);
            } else {
                // No row selected → create as root WBS (null / GUID zero parent)
                this._openWbsDialog(null, null, null);
            }
        },

        // ── WBS: EDIT ────────────────────────────────────────────────────────
        onEditWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToEditError"));
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show(oBundle.getText("selectOneWbsToEditError"));
                return;
            }

            var oCtx = oTable.getContextByIndex(aIndices[0]);
            this._openWbsDialog(oCtx, null, null);
        },

        // ── WBS: DELETE ───────────────────────────────────────────────────────
        onDeleteWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToDeleteError"));
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show(oBundle.getText("selectOneWbsToDeleteError"));
                return;
            }

            var oCtx = oTable.getContextByIndex(aIndices[0]);
            var sName = oCtx.getProperty("WbsName");
            var sWbsId = oCtx.getProperty("WbsId");
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            MessageBox.confirm(oBundle.getText("deleteWbsConfirm", [sName]), {
                title: oBundle.getText("confirmDeleteWbs"),
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove("/WBSSet(guid'" + sWbsId + "')", {
                            success: function () {
                                MessageToast.show(oBundle.getText("wbsDeletedSuccess", [sName]));
                                that._loadWbsData();
                            },
                            error: function () { MessageBox.error(oBundle.getText("wbsDeleteError")); }
                        });
                    }
                }
            });
        },

        // ── WBS: APPROVAL FLOW ──────────────────────────────────────────────
        onSubmitOpenWbsApproval: function () {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsForOpenApprovalError"));
                return;
            }

            // Check if all selected items are in PLANNING status
            var aInvalidItems = [];
            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();
                if (oData.Status !== "PLANNING") {
                    aInvalidItems.push(oData.WbsName + " (Status: " + oData.Status + ")");
                }
            });

            if (aInvalidItems.length > 0) {
                MessageBox.error(oBundle.getText("planningOnlyOpenApprovalError", [aInvalidItems.join("\n- ")]));
                return;
            }

            MessageBox.confirm(oBundle.getText("submitOpenApprovalConfirm", [aIndices.length]), {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._submitMultipleWbs(aIndices, false);
                    }
                }
            });
        },

        onSubmitCloseWbsApproval: function () {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsForCloseApprovalError"));
                return;
            }

            // Check if all selected items are in IN_PROGRESS status
            var aInvalidItems = [];
            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();
                if (oData.Status !== "IN_PROGRESS") {
                    aInvalidItems.push(oData.WbsName + " (Status: " + oData.Status + ")");
                }
            });

            if (aInvalidItems.length > 0) {
                MessageBox.error(oBundle.getText("inProgressOnlyCloseApprovalError", [aInvalidItems.join("\n- ")]));
                return;
            }

            MessageBox.confirm(oBundle.getText("submitCloseApprovalConfirm", [aIndices.length]), {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._submitMultipleWbs(aIndices, true);
                    }
                }
            });
        },

        _submitMultipleWbs: function (aIndices, bIsClose) {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var oModel = this.getOwnerComponent().getModel();
            var iDone = 0;
            var iError = 0;

            this.getView().setBusy(true);

            var fnNext = function () {
                var oBundle = that.getView().getModel("i18n").getResourceBundle();
                if (iDone + iError === aIndices.length) {
                    that.getView().setBusy(false);
                    if (iError === 0) {
                        MessageToast.show(oBundle.getText("submitSuccess", [iDone]));
                    } else {
                        MessageBox.warning(oBundle.getText("submitPartialError", [iError]));
                    }
                    that._loadWbsData();
                    return;
                }

                var iIdx = aIndices[iDone + iError];
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();

                var sEndpoint = bIsClose ? "/CloseWbsApproval" : "/StartWSProcess";
                var oParams = bIsClose ? { WBS_IDS: oData.WbsId } : { WS_ID: oData.WbsId };

                oModel.callFunction(sEndpoint, {
                    method: "POST",
                    urlParameters: oParams,
                    changeSetId: oData.WbsId, // Ensure separate changeset per item
                    success: function () {
                        iDone++;
                        fnNext();
                    },
                    error: function (oError) {
                        iError++;
                        fnNext();
                    }
                });
            };

            fnNext();
        },

        // ── WBS: RUN (Switch from OPENED to IN_PROGRESS) ─────────────────────
        onRunWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aIndices.length === 0) {
                MessageToast.show(oBundle.getText("selectWbsToRunError"));
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show(oBundle.getText("selectOneWbsToRunError"));
                return;
            }

            var oCtx = oTable.getContextByIndex(aIndices[0]);
            var oData = oCtx.getObject();
            var sStatus = oData.Status;
            var dStartDate = oData.StartDate;
            var dToday = new Date();
            dToday.setHours(0, 0, 0, 0);

            // 1. Check Status
            if (sStatus !== "OPENED") {
                MessageBox.warning(oBundle.getText("openedOnlyRunError", [sStatus]));
                return;
            }

            // 2. Check Start Date
            if (dStartDate && new Date(dStartDate) > dToday) {
                var sFormattedDate = this.formatDate(dStartDate);
                MessageBox.error(oBundle.getText("startDateRunError", [sFormattedDate]));
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            MessageBox.confirm(oBundle.getText("runWbsConfirm", [oData.WbsName]), {
                title: oBundle.getText("confirmRunWbs"),
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that.getView().setBusy(true);
                        oModel.update("/WBSSet(guid'" + oData.WbsId + "')", { Status: "IN_PROGRESS" }, {
                            success: function () {
                                that.getView().setBusy(false);
                                MessageToast.show(oBundle.getText("wbsRunSuccess"));
                                that._loadWbsData();
                                oModel.refresh(true);
                            },
                            error: function (oError) {
                                that.getView().setBusy(false);
                                MessageBox.error(oBundle.getText("wbsRunError"));
                            }
                        });
                    }
                }
            });
        },

        // ── WBS: PENDING APPROVAL LOGIC ───────────────────────────────────────
        onApproveWbs: function () {
            this._processPendingWbs("0001"); // 0001 = Approve
        },

        onRejectWbs: function () {
            this._processPendingWbs("0002"); // 0002 = Reject
        },

        _processPendingWbs: function (sDecisionCode) {
            var that = this;
            var oTable = this.byId("pendingApprovalTable"); // Unified table for both Open & Close
            var aSelectedItems = oTable.getSelectedItems();

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (aSelectedItems.length === 0) {
                MessageToast.show(oBundle.getText("selectPendingWbsError"));
                return;
            }

            var aItemsToProcess = [];
            var bError = false;

            aSelectedItems.forEach(function (oItem) {
                var oCtx = oItem.getBindingContext("viewData");
                var oWbs = oCtx.getObject();

                // Extract the EXACT active WorkItemId populated by CheckDecision
                var sWorkItemId = oWbs.WorkItemId || "";

                if (!sWorkItemId) {
                    bError = true;
                } else {
                    aItemsToProcess.push({
                        WorkItemId: sWorkItemId,
                        WbsName: oWbs.WbsName
                    });
                }
            });

            if (bError && aItemsToProcess.length === 0) {
                MessageBox.error(oBundle.getText("workItemIdNotFoundError"));
                return;
            }

            if (!this._oApproveDialog) {
                this._oApproveDialog = new Dialog({
                    title: oBundle.getText("decisionNote"),
                    type: "Message",
                    content: [
                        new Label({ text: oBundle.getText("decisionCommentLabel"), labelFor: "approveNote" }),
                        new TextArea("approveNote", {
                            width: "100%",
                            placeholder: oBundle.getText("decisionNotePlaceholder"),
                            rows: 4
                        })
                    ],
                    beginButton: new Button({
                        text: oBundle.getText("submit"),
                        type: "Emphasized",
                        press: function () {
                            var sUserNote = sap.ui.getCore().byId("approveNote").getValue();
                            if (this._sPendingDecision === "0002" && (!sUserNote || sUserNote.trim() === "")) {
                                MessageBox.error(oBundle.getText("rejectReasonRequiredError"));
                                return;
                            }
                            this._oApproveDialog.close();
                            this._submitDecisionBatch(this._aPendingItems, this._sPendingDecision, sUserNote);
                        }.bind(this)
                    }),
                    endButton: new Button({
                        text: oBundle.getText("cancel"),
                        press: function () {
                            this._oApproveDialog.close();
                        }.bind(this)
                    })
                });
                this.getView().addDependent(this._oApproveDialog);
            }

            this._sPendingDecision = sDecisionCode; // "0001" or "0002"
            this._aPendingItems = aItemsToProcess;
            sap.ui.getCore().byId("approveNote").setValue("");
            this._oApproveDialog.open();
        },

        _submitDecisionBatch: function (aItems, sDecision, sUserNote) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var iDone = 0;
            var iError = 0;

            this.getView().setBusy(true);

            var fnNext = function () {
                var oBundle = that.getView().getModel("i18n").getResourceBundle();
                if (iDone + iError === aItems.length) {
                    that.getView().setBusy(false);
                    if (iError === 0) {
                        MessageToast.show(oBundle.getText("processSuccess", [iDone]));
                    } else {
                        MessageBox.warning(oBundle.getText("submitPartialError", [iError]));
                    }
                    that._loadWbsData();
                    oModel.refresh(true);
                    return;
                }

                var oItem = aItems[iDone + iError];

                oModel.callFunction("/PostDecision", {
                    method: "POST",
                    urlParameters: {
                        WI_ID: oItem.WorkItemId,
                        Decision: sDecision,
                        Note: sUserNote
                    },
                    changeSetId: oItem.WorkItemId,
                    success: function (oData) {
                        var oResult = oData.PostDecision || oData;
                        if (oResult && oResult.SUCCESS === false) {
                            iError++;
                        } else {
                            iDone++;
                        }
                        fnNext();
                    },
                    error: function (oError) {
                        iError++;
                        fnNext();
                    }
                });
            };

            fnNext();
        },

        // ── PRIVATE: Create/Edit WBS Dialog ───────────────────────────────────
        _openWbsDialog: function (oContext, sParentId, sParentName) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oInputCode = new Input({
                placeholder: "e.g. 1.1.1",
                liveChange: function (oEvent) {
                    var oControl = oEvent.getSource();
                    var sVal = oControl.getValue();
                    if (sVal) {
                        oControl.setValue(sVal.toUpperCase());
                    }
                }
            });
            var oInputName = new Input({ placeholder: oBundle.getText("workItemName") });
            var oPickerStart = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd" });
            var oPickerEnd = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd" });
            var oInputQty = new Input({ type: "Number", placeholder: "0" });

            var oSelectUnit = new Select({
                width: "100%",
                items: [
                    new Item({ key: "M3", text: "Cubic Meter (M3)" }),
                    new Item({ key: "M2", text: "Square Meter (M2)" }),
                    new Item({ key: "M", text: "Linear Meter (M)" }),
                    new Item({ key: "TON", text: "Ton (TON)" }),
                    new Item({ key: "EA", text: "Each (EA)" })
                ]
            });
            var oSelectStatus = new Select({
                width: "100%",
                items: [
                    new Item({ key: "PLANNING", text: oBundle.getText("planningStatus") }),
                    new Item({ key: "PENDING_OPEN", text: oBundle.getText("pendingOpenStatus") || "Pending Open" }),
                    new Item({ key: "OPENED", text: oBundle.getText("openedStatus") || "Opened" }),
                    new Item({ key: "IN_PROGRESS", text: oBundle.getText("inProgressStatus") }),
                    new Item({ key: "PENDING_CLOSE", text: oBundle.getText("pendingCloseStatus") || "Pending Close" }),
                    new Item({ key: "CLOSED", text: oBundle.getText("closedStatus") || "Closed" })
                ],
                visible: false
            });

            var sDialogTitle;
            if (bEdit) {
                sDialogTitle = oBundle.getText("editWbs");
                oInputCode.setValue(oContext.getProperty("WbsCode"));
                oInputName.setValue(oContext.getProperty("WbsName"));
                var oStart = oContext.getProperty("StartDate");
                var oEnd = oContext.getProperty("EndDate");
                if (oStart) oPickerStart.setDateValue(oStart);
                if (oEnd) oPickerEnd.setDateValue(oEnd);
                var sQty = oContext.getProperty("Quantity");
                if (sQty) oInputQty.setValue(parseFloat(sQty));
                oSelectUnit.setSelectedKey(oContext.getProperty("UnitCode"));
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
            } else {
                sDialogTitle = sParentId
                    ? oBundle.getText("addChildWbsOf", [sParentName])
                    : oBundle.getText("createWbsRoot");
                oSelectStatus.setSelectedKey("NEW");
            }

            var oStatusLabel = new Label({ text: oBundle.getText("status"), visible: false });

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: oBundle.getText("wbsCode"), required: true }), oInputCode,
                    new Label({ text: oBundle.getText("name"), required: true }), oInputName,
                    new Label({ text: oBundle.getText("startDate"), required: true }), oPickerStart,
                    new Label({ text: oBundle.getText("endDate"), required: true }), oPickerEnd,
                    new Label({ text: oBundle.getText("quantity"), required: true }), oInputQty,
                    new Label({ text: oBundle.getText("unit") }), oSelectUnit,
                    oStatusLabel, oSelectStatus
                ]
            });

            // --- LOCATION TAB ---
            var oLocName = new Input({ placeholder: oBundle.getText("locationPlaceholder") });
            var oLocCode = new Input({ placeholder: oBundle.getText("locationCodePlaceholder") });
            var oLocType = new Input({ placeholder: oBundle.getText("locationTypePlaceholder") });
            var oLocStart = new Input({ type: "Number", placeholder: "0.000" });
            var oLocEnd = new Input({ type: "Number", placeholder: "0.000" });
            var oLocTop = new Input({ type: "Number", placeholder: "0.000" });
            var oLocBot = new Input({ type: "Number", placeholder: "0.000" });

            var sEditLocationId = null;
            if (bEdit) {
                var sEditWbsId = oContext.getProperty("WbsId");
                oModel.read("/LocationSet", {
                    filters: [new sap.ui.model.Filter("WbsId", sap.ui.model.FilterOperator.EQ, sEditWbsId)],
                    success: function (oData) {
                        if (oData && oData.results && oData.results.length > 0) {
                            // Client-side fallback just in case backend ignores filters
                            var aMatches = oData.results.filter(function (loc) { return loc.WbsId === sEditWbsId; });
                            if (aMatches.length > 0) {
                                var oFirstLoc = aMatches[0];
                                sEditLocationId = oFirstLoc.LocationId;
                                oLocName.setValue(oFirstLoc.LocationName);
                                oLocCode.setValue(oFirstLoc.LocationCode);
                                oLocType.setValue(oFirstLoc.LocationType);
                                if (oFirstLoc.PosStart) oLocStart.setValue(parseFloat(oFirstLoc.PosStart));
                                if (oFirstLoc.PosEnd) oLocEnd.setValue(parseFloat(oFirstLoc.PosEnd));
                                if (oFirstLoc.PosTop) oLocTop.setValue(parseFloat(oFirstLoc.PosTop));
                                if (oFirstLoc.PosBot) oLocBot.setValue(parseFloat(oFirstLoc.PosBot));
                            }
                        }
                    },
                    error: function (e) { console.error("Error fetching location data", e); }
                });
            }

            var oLocForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: oBundle.getText("locationName") }), oLocName,
                    new Label({ text: oBundle.getText("locationCode") }), oLocCode,
                    new Label({ text: oBundle.getText("locationType") }), oLocType,
                    new Label({ text: oBundle.getText("posStart") }), oLocStart,
                    new Label({ text: oBundle.getText("posEnd") }), oLocEnd,
                    new Label({ text: oBundle.getText("posTop") }), oLocTop,
                    new Label({ text: oBundle.getText("posBot") }), oLocBot
                ]
            });

            var oIconTabBar = new sap.m.IconTabBar({
                items: [
                    new sap.m.IconTabFilter({
                        text: oBundle.getText("wbsDetailTab"),
                        icon: "sap-icon://form",
                        content: [oForm]
                    }),
                    new sap.m.IconTabFilter({
                        text: oBundle.getText("locationTab"),
                        icon: "sap-icon://map",
                        content: [oLocForm]
                    })
                ]
            });

            var oDialog = new Dialog({
                title: sDialogTitle,
                contentWidth: "500px",
                content: [oIconTabBar],
                beginButton: new Button({
                    text: bEdit ? oBundle.getText("saveChanges") : oBundle.getText("createWbs"),
                    type: "Emphasized",
                    press: function () {
                        var sWbsCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        var dStart = oPickerStart.getDateValue();
                        var dEnd = oPickerEnd.getDateValue();
                        if (!sWbsCode || !sName || !dStart || !dEnd) {
                            MessageToast.show(oBundle.getText("wbsFieldsRequired"));
                            return;
                        }

                        var toUTC = function (d) {
                            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        };
                        var oPayload = {
                            WbsCode: sWbsCode,
                            WbsName: sName,
                            StartDate: toUTC(dStart),
                            EndDate: toUTC(dEnd),
                            Quantity: oInputQty.getValue() || "0",
                            UnitCode: oSelectUnit.getSelectedKey(),
                            Status: "PLANNING"
                        };

                        var fnSaveLocation = function (sTargetWbsId, fnDone) {
                            var sLName = oLocName.getValue().trim();
                            if (!sLName && !oLocCode.getValue().trim()) {
                                fnDone(); // No location data entered
                                return;
                            }

                            var formatDecimal = function (val) {
                                var f = parseFloat(val);
                                return isNaN(f) ? "0.00" : f.toFixed(2);
                            };

                            var oLocPayload = {
                                WbsId: sTargetWbsId,
                                LocationName: sLName,
                                LocationCode: oLocCode.getValue().trim(),
                                LocationType: oLocType.getValue().trim(),
                                PosStart: formatDecimal(oLocStart.getValue()),
                                PosEnd: formatDecimal(oLocEnd.getValue()),
                                PosTop: formatDecimal(oLocTop.getValue()),
                                PosBot: formatDecimal(oLocBot.getValue())
                            };
                            if (bEdit && sEditLocationId) {
                                oModel.update("/LocationSet(guid'" + sEditLocationId + "')", oLocPayload, {
                                    success: function () { fnDone(); }, error: function () { fnDone(); }
                                });
                            } else {
                                oModel.create("/LocationSet", oLocPayload, {
                                    success: function () { fnDone(); }, error: function () { fnDone(); }
                                });
                            }
                        };

                        if (bEdit) {
                            var sEditWbsId = oContext.getProperty("WbsId");
                            oPayload.Status = oSelectStatus.getSelectedKey() || oContext.getProperty("Status") || "PLANNING";
                            oModel.update("/WBSSet(guid'" + sEditWbsId + "')", oPayload, {
                                success: function () {
                                    fnSaveLocation(sEditWbsId, function () {
                                        MessageToast.show(oBundle.getText("wbsUpdated"));
                                        oDialog.close();
                                        oModel.refresh(true);
                                        that._loadWbsData();
                                    });
                                },
                                error: function () { MessageBox.error(oBundle.getText("errorUpdatingWbs")); }
                            });
                        } else {
                            oPayload.SiteId = that._sCurrentSiteId;
                            oPayload.ParentId = sParentId || null;
                            oModel.create("/WBSSet", oPayload, {
                                success: function (oData) {
                                    var sNewWbsId = oData.WbsId || (oData.d && oData.d.WbsId);
                                    if (sNewWbsId) {
                                        fnSaveLocation(sNewWbsId, function () {
                                            MessageToast.show(oBundle.getText("wbsCreatedSuccessfully"));
                                            oDialog.close();
                                            that._loadWbsData();
                                        });
                                    } else {
                                        MessageToast.show(oBundle.getText("wbsCreatedNoLocationLink"));
                                        oDialog.close();
                                        that._loadWbsData();
                                    }
                                },
                                error: function () { MessageBox.error(oBundle.getText("errorCreatingWbs")); }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: oBundle.getText("cancel"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.addStyleClass("sapUiContentPadding");
            oDialog.open();
        },

        _transformToTree: function (aData) {
            var map = {}, node, res = [], i;
            for (i = 0; i < aData.length; i++) {
                map[aData[i].WbsId] = i;
                aData[i].children = [];
            }
            for (i = 0; i < aData.length; i++) {
                node = aData[i];
                if (node.ParentId && map[node.ParentId] !== undefined) {
                    aData[map[node.ParentId]].children.push(node);
                } else {
                    res.push(node);
                }
            }
            return res;
        },

        isRootNode: function (v) { return this._oWBSDelegate.isRootNode(v); },
        isChildNode: function (v) { return this._oWBSDelegate.isChildNode(v); },
        calcMargin: function (s) { return this._oWBSDelegate.calcMargin(s); },
        calcWidth: function (s, e) { return this._oWBSDelegate.calcWidth(s, e); },

        formatDate: function (oDate) {
            if (!oDate) return "";
            return DateFormat.getInstance({ pattern: "dd/MM/yyyy" }).format(oDate);
        },

        formatWorkVolume: function (sQuantity, sUnitCode) {
            if (!sQuantity || sQuantity === "0" || sQuantity === "0.000") return "";
            var fQty = parseFloat(sQuantity);
            if (isNaN(fQty)) return "";
            var sFormattedQty = Math.round(fQty).toString();
            var sUnit = sUnitCode ? " " + sUnitCode : "";
            return sFormattedQty + sUnit;
        },

        formatWbsStatusState: function (sStatus) {
            switch (sStatus) {
                case "PLANNING": return "None";
                case "PENDING_OPEN": return "Information";
                case "OPENED": return "Success";
                case "IN_PROGRESS": return "Warning";
                case "PENDING_CLOSE": return "Information";
                case "CLOSED": return "None";
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
                default: return "sap-icon://status-in-process";
            }
        },

        formatTotalQty: function (v) {
            if (!v) return "0";
            var f = parseFloat(v);
            return isNaN(f) ? "0" : Math.round(f).toString();
        },

        // ── PENDING APPROVAL - CLOSE (ACCEPTANCE REPORT) REMOVED AS REQUESTED ──


        onSubmitForApproval: function () {
            // This is handled in WBS Detail, for Site Detail it shouldn't be visible in Approval Mode.
        },

        _loadLocation: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oLocationModel = this.getView().getModel("locationModel");
            oLocationModel.setData({});
            oModel.read("/LocationSet", {
                filters: [new sap.ui.model.Filter("WbsId", sap.ui.model.FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        oLocationModel.setData(oData.results[0]);
                    }
                }
            });
        },

        _loadProjectInfo: function (sSiteId) {
            var oModel = this.getOwnerComponent().getModel();
            var oProjectModel = this.getView().getModel("projectModel");
            oProjectModel.setData({});
            if (!sSiteId) return;

            oModel.read("/SiteSet(guid'" + sSiteId + "')", {
                success: function (oSiteData) {
                    if (oSiteData && oSiteData.ProjectId) {
                        oModel.read("/ProjectSet(guid'" + oSiteData.ProjectId + "')", {
                            success: function (oProjectData) {
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

        onGanttTaskClick: function (oEvent) {
            var oContext = oEvent.getParameter("rowBindingContext");
            if (!oContext) return;

            this.getOwnerComponent().getRouter().navTo("WBSDetail", {
                site_id: oContext.getProperty("SiteId"),
                wbsId: oContext.getProperty("WbsId")
            });
        }
    });

    Object.assign(SiteDetailController.prototype, {
        _loadWorkSummary: WorkSummaryDelegate._loadWorkSummary,
        formatTotalQty: WorkSummaryDelegate.formatTotalQty
    });

    return SiteDetailController;
});