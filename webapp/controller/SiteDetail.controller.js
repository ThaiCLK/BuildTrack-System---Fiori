sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "z/bts/buildtrack/controller/delegate/WBSDelegate",
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
    "sap/ui/layout/form/SimpleForm"
], function (Controller, WBSDelegate, JSONModel, DateFormat,
    MessageToast, MessageBox, Dialog, Button, Label, Input,
    Select, Item, DatePicker, TextArea, Filter, FilterOperator, SimpleForm) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.SiteDetail", {

        onInit: function () {
            this._oWBSDelegate = new WBSDelegate(this);
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("SiteDetail").attachPatternMatched(this._onObjectMatched, this);
            this.getView().setModel(new JSONModel({
                WBS: [],
                pendingWBS: []
            }), "viewData");
            this.getView().setModel(new JSONModel(), "viewConfig");

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
            oModel.read("/WBSSet", {
                filters: [new Filter("SiteId", FilterOperator.EQ, this._sCurrentSiteId)],
                urlParameters: {
                    "$expand": "ToSubWbs,ToSubWbs/ToApprovalLog,ToApprovalLog",
                    "$orderby": "WbsCode"
                },
                success: function (oData) {
                    var aResults = oData.results || [];
                    var aTreeData = that._transformToTree(aResults);
                    var oGanttConfig = that._oWBSDelegate.prepareGanttData(aTreeData);
                    that.getView().getModel("viewData").setProperty("/WBS", aTreeData);
                    that.getView().getModel("viewConfig").setData(oGanttConfig);

                    console.log("Total WBS items loaded:", aResults.length);

                    // 1. Filter items that are globally in a PENDING status
                    var aGlobalPending = aResults.filter(function (item) {
                        return item.Status === "PENDING_OPEN" || item.Status === "PENDING_CLOSE";
                    });

                    console.log("Found globally pending items:", aGlobalPending.length);

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

                        console.log("Calling CheckDecision for WBS:", oItem.WbsId, "Type:", sType);

                        oModel.callFunction("/CheckDecision", {
                            method: "POST",
                            urlParameters: {
                                WBS_IDS: oItem.WbsId,
                                ApprovalType: sType
                            },
                            changeSetId: oItem.WbsId, // Ensure separate changeset per item
                            success: function (oResponse) {
                                console.log("CheckDecision Result for " + oItem.WbsCode + ":", oResponse);

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
                                    console.log("WBS " + oItem.WbsCode + " is ACTIONABLE for current user. WI_ID: " + (oResult.WORKITEM_ID || "N/A"));
                                    aUserActionableItems.push(oItem);
                                } else {
                                    console.log("WBS " + oItem.WbsCode + " is NOT actionable. Result:", oResult);
                                }

                                iProcessed++;
                                if (iProcessed === aGlobalPending.length) {
                                    that.getView().getModel("viewData").setProperty("/pendingWBS", aUserActionableItems);
                                    console.log("Update Pending List with " + aUserActionableItems.length + " items.");
                                }
                            },
                            error: function (oError) {
                                console.error("CheckDecision Failed for " + oItem.WbsCode + ":", oError);
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

            if (aIndices.length > 1) {
                MessageToast.show("Please select only ONE row to create a child WBS.");
                return;
            }

            if (aIndices.length === 1) {
                // A row is selected → create as child of that row
                var oCtx = oTable.getContextByIndex(aIndices[0]);
                var sParentId = oCtx ? oCtx.getProperty("WbsId") : null;
                var sParentName = oCtx ? oCtx.getProperty("WbsName") : "";
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

            if (aIndices.length === 0) {
                MessageToast.show("Please select a WBS row to edit.");
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show("Please select only ONE row to edit.");
                return;
            }

            var oCtx = oTable.getContextByIndex(aIndices[0]);
            this._openWbsDialog(oCtx, null, null);
        },

        // ── WBS: DELETE ───────────────────────────────────────────────────────
        onDeleteWbs: function () {
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            if (aIndices.length === 0) {
                MessageToast.show("Please select a WBS row to delete.");
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show("Please select only ONE row to delete.");
                return;
            }

            var oCtx = oTable.getContextByIndex(aIndices[0]);
            var sName = oCtx.getProperty("WbsName");
            var sWbsId = oCtx.getProperty("WbsId");
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            MessageBox.confirm("Are you sure you want to delete WBS \"" + sName + "\"?\nChild WBS items will not be deleted automatically.", {
                title: "Confirm Delete WBS",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove("/WBSSet(guid'" + sWbsId + "')", {
                            success: function () {
                                MessageToast.show("WBS deleted: " + sName);
                                that._loadWbsData();
                            },
                            error: function () { MessageBox.error("Unable to delete WBS."); }
                        });
                    }
                }
            });
        },

        // ── WBS: APPROVAL FLOW ──────────────────────────────────────────────
        onSubmitWbsApproval: function () {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var aIndices = oTable ? oTable.getSelectedIndices() : [];

            if (aIndices.length === 0) {
                MessageToast.show("Please select WBS items to submit for approval.");
                return;
            }

            // Check if all selected items are in PLANNING status
            var aInvalidItems = [];
            aIndices.forEach(function (iIdx) {
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();
                if (oData.Status !== "PLANNING" && oData.Status !== "OPEN_REJECTED") {
                    aInvalidItems.push(oData.WbsName + " (Status: " + oData.Status + ")");
                }
            });

            if (aInvalidItems.length > 0) {
                var sAllowed = "'Planning' or 'Open Rejected'";
                MessageBox.error("Only WBS items in " + sAllowed + " status can be submitted. Invalid items:\n\n- " + aInvalidItems.join("\n- "));
                return;
            }

            MessageBox.confirm("Submit " + aIndices.length + " items for approval?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._submitMultipleWbs(aIndices);
                    }
                }
            });
        },

        _submitMultipleWbs: function (aIndices) {
            var that = this;
            var oTable = this.byId("wbsTreeTable");
            var oModel = this.getOwnerComponent().getModel();
            var iDone = 0;
            var iError = 0;

            this.getView().setBusy(true);

            var fnNext = function () {
                if (iDone + iError === aIndices.length) {
                    that.getView().setBusy(false);
                    if (iError === 0) {
                        MessageToast.show("Submitted " + iDone + " items successfully.");
                    } else {
                        MessageBox.warning("Completed with " + iError + " errors.");
                    }
                    that._loadWbsData();
                    return;
                }

                var iIdx = aIndices[iDone + iError];
                var oCtx = oTable.getContextByIndex(iIdx);
                var oData = oCtx.getObject();

                oModel.callFunction("/StartWSProcess", {
                    method: "POST",
                    urlParameters: {
                        WS_ID: oData.WbsId
                    },
                    changeSetId: oData.WbsId, // Ensure separate changeset per item
                    success: function () {
                        iDone++;
                        fnNext();
                    },
                    error: function (oError) {
                        console.error("Submission failed for " + oData.WbsName, oError);
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

            if (aIndices.length === 0) {
                MessageToast.show("Please select a WBS row to run.");
                return;
            } else if (aIndices.length > 1) {
                MessageToast.show("Please select only ONE row to run.");
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
                MessageBox.warning("Only WBS with status 'OPENED' can be started. Current status: " + sStatus);
                return;
            }

            // 2. Check Start Date
            if (dStartDate && new Date(dStartDate) > dToday) {
                var sFormattedDate = this.formatDate(dStartDate);
                MessageBox.error("Cannot run WBS before its Start Date (" + sFormattedDate + ").");
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            MessageBox.confirm("Do you want to start WBS '" + oData.WbsName + "'? Status will change to IN_PROGRESS.", {
                title: "Confirm Start WBS",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that.getView().setBusy(true);
                        oModel.update("/WBSSet(guid'" + oData.WbsId + "')", { Status: "IN_PROGRESS" }, {
                            success: function () {
                                that.getView().setBusy(false);
                                MessageToast.show("WBS is now IN_PROGRESS.");
                                that._loadWbsData();
                                oModel.refresh(true);
                            },
                            error: function (oError) {
                                that.getView().setBusy(false);
                                console.error("Error starting WBS:", oError);
                                MessageBox.error("Failed to start WBS.");
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
            var oTable = this.byId("pendingWbsTable");
            var aSelectedItems = oTable.getSelectedItems();

            if (aSelectedItems.length === 0) {
                MessageToast.show("Please select at least one pending WBS item.");
                return;
            }

            var aItemsToProcess = [];
            var bError = false;

            aSelectedItems.forEach(function (oItem) {
                var oCtx = oItem.getBindingContext("viewData");
                var oWbs = oCtx.getObject();

                // Extract the LATEST WorkItemId from the logs
                var sWorkItemId = "";
                var aLogs = (oWbs.ToApprovalLog && oWbs.ToApprovalLog.results) ? oWbs.ToApprovalLog.results : [];

                if (aLogs.length > 0) {
                    aLogs.sort(function (a, b) {
                        return new Date(b.CreatedTimestamp) - new Date(a.CreatedTimestamp);
                    });
                    sWorkItemId = aLogs[0].WorkItemId;
                }

                if (!sWorkItemId) {
                    sWorkItemId = oWbs.WorkItemId || "";
                }

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
                MessageBox.error("Cannot find Work Item ID for selected items. Please refresh and try again.");
                return;
            }

            if (!this._oApproveDialog) {
                this._oApproveDialog = new Dialog({
                    title: "Decision Note",
                    type: "Message",
                    content: [
                        new Label({ text: "Add a comment for this decision:", labelFor: "approveNote" }),
                        new TextArea("approveNote", {
                            width: "100%",
                            placeholder: "Enter reason or note here...",
                            rows: 4
                        })
                    ],
                    beginButton: new Button({
                        text: "Submit",
                        type: "Emphasized",
                        press: function () {
                            var sUserNote = sap.ui.getCore().byId("approveNote").getValue();
                            this._oApproveDialog.close();
                            this._submitDecisionBatch(this._aPendingItems, this._sPendingDecision, sUserNote);
                        }.bind(this)
                    }),
                    endButton: new Button({
                        text: "Cancel",
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
                if (iDone + iError === aItems.length) {
                    that.getView().setBusy(false);
                    if (iError === 0) {
                        MessageToast.show("Processed " + iDone + " items successfully.");
                    } else {
                        MessageBox.warning("Completed with " + iError + " errors.");
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
                            console.error("PostDecision Logic Error for " + oItem.WbsName + ":", oResult.MESSAGE);
                            iError++;
                        } else {
                            iDone++;
                        }
                        fnNext();
                    },
                    error: function (oError) {
                        console.error("PostDecision Request Error for " + oItem.WbsName + ":", oError);
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
            var oInputName = new Input({ placeholder: "Work item name" });
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
                    new Item({ key: "PLANNING", text: "Planning" }),
                    new Item({ key: "PENDING_OPEN", text: "Pending Open" }),
                    new Item({ key: "OPEN_REJECTED", text: "Open Rejected" }),
                    new Item({ key: "OPENED", text: "Opened" }),
                    new Item({ key: "IN_PROGRESS", text: "In Progress" }),
                    new Item({ key: "PENDING_CLOSE", text: "Pending Close" }),
                    new Item({ key: "CLOSE_REJECTED", text: "Close Rejected" }),
                    new Item({ key: "CLOSED", text: "Closed" })
                ],
                visible: false
            });

            var sDialogTitle;
            if (bEdit) {
                sDialogTitle = "Edit WBS";
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
                    ? "Add Child WBS of: " + sParentName
                    : "Create WBS (Root Level)";
                oSelectStatus.setSelectedKey("NEW");
            }

            var oStatusLabel = new Label({ text: "Status", visible: false });

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: "WBS Code", required: true }), oInputCode,
                    new Label({ text: "Name", required: true }), oInputName,
                    new Label({ text: "Start Date", required: true }), oPickerStart,
                    new Label({ text: "End Date", required: true }), oPickerEnd,
                    new Label({ text: "Quantity", required: true }), oInputQty,
                    new Label({ text: "Unit" }), oSelectUnit,
                    oStatusLabel, oSelectStatus
                ]
            });

            var oDialog = new Dialog({
                title: sDialogTitle,
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? "Save Changes" : "Create WBS",
                    type: "Emphasized",
                    press: function () {
                        var sWbsCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        var dStart = oPickerStart.getDateValue();
                        var dEnd = oPickerEnd.getDateValue();
                        var sQuantity = oInputQty.getValue() || "0";
                        if (!sWbsCode || !sName || !dStart || !dEnd) {
                            MessageToast.show("Please enter all required fields!");
                            return;
                        }
                        // Fix timezone shift: getDateValue() returns local midnight (UTC+7).
                        // Converting to UTC midnight avoids the date being stored 1 day earlier.
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
                            Status: "PLANNING"  // Default for new WBS; overridden on Edit
                        };
                        if (bEdit) {
                            // Key = WbsId of the row being edited (read from context, not from a form input)
                            var sEditWbsId = oContext.getProperty("WbsId");
                            oPayload.Status = oSelectStatus.getSelectedKey() || oContext.getProperty("Status") || "PLANNING";
                            oModel.update("/WBSSet(guid'" + sEditWbsId + "')", oPayload, {
                                success: function () {
                                    MessageToast.show("WBS updated!");
                                    oDialog.close();
                                    // refresh(true) clears OData V2 client cache so the next
                                    // read() fetches fresh data instead of a stale cached response
                                    oModel.refresh(true);
                                    that._loadWbsData();
                                },
                                error: function () { MessageBox.error("Error updating WBS!"); }
                            });
                        } else {
                            // Backend generates WbsId (GUID) — FE must supply SiteId + optional ParentId
                            oPayload.SiteId = that._sCurrentSiteId;
                            oPayload.ParentId = sParentId || null;
                            oModel.create("/WBSSet", oPayload, {
                                success: function () { MessageToast.show("WBS created successfully!"); oDialog.close(); that._loadWbsData(); },
                                error: function () { MessageBox.error("Error creating WBS!"); }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
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
            var sFormattedQty = parseFloat(sQuantity).toString(); // remove trailing zeros
            var sUnit = sUnitCode ? " " + sUnitCode : "";
            return sFormattedQty + sUnit;
        },

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

        formatStatusText: function (sStatus) {
            var mLabels = {
                "PLANNING": "Planning",
                "SUBMITTED": "Submitted",
                "REJECTED": "Rejected",
                "READY": "Ready",
                "IN_PROGRESS": "In Progress",
                "COMPLETED": "Completed"
            };
            return mLabels[(sStatus || "").toUpperCase()] || sStatus;
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
                default: return "sap-icon://status-in-process";
            }
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
});