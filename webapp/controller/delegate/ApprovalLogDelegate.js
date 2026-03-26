sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], function (Filter, FilterOperator, JSONModel) {
    "use strict";

    return {

        /* =========================================================== */
        /* INIT                                                        */
        /* =========================================================== */

        /**
         * Registers all Approval Log handlers onto the WBSDetail controller.
         * Call once from WBSDetail.controller.js onInit().
         */
        init: function (oController) {
            oController._bindApprovalLogList = this._bindApprovalLogList.bind(oController);
            oController._doLoadAndFilter = this._doLoadAndFilter.bind(oController);
            oController.updateProcessFlow = this.updateProcessFlow.bind(oController);
            oController.formatApprovalActionText = this.formatApprovalActionText.bind(oController);
            oController.formatApprovalActionState = this.formatApprovalActionState.bind(oController);
            oController.formatApprovalActionIcon = this.formatApprovalActionIcon.bind(oController);
            oController.onLogSelectionChange = this.onLogSelectionChange.bind(oController);
            oController._initInvestorCanvas = this._initInvestorCanvas.bind(oController);

            // Stubs for old references
            oController.onSignInvestorPress = function (oEvent) {
                console.log("onSignInvestorPress was called, attempting to open dialog...");
                // Open the signature dialog and set current approval level based on which button is visible
                var oView = oController.getView();
                var oViewData = oView.getModel("viewData");
                var iLevel = 0;
                if (oViewData.getProperty("/canApproveLevel1")) iLevel = 1;
                else if (oViewData.getProperty("/canApproveLevel2")) iLevel = 2;
                else if (oViewData.getProperty("/canApproveLevel3")) iLevel = 3;
                oViewData.setProperty("/currentApprovalLevel", iLevel);
                if (!oController._pSignatureDialog) {
                    oController._pSignatureDialog = sap.ui.core.Fragment.load({
                        id: oView.getId(),
                        name: "z.bts.buildtrack551.view.fragments.SignatureDialog",
                        controller: oController
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        return oDialog;
                    });
                }
                oController._pSignatureDialog.then(function (oDialog) {
                    oDialog.open();
                });
            };
            oController.onClearSignature = function () {
                var oCanvas = document.getElementById("signatureCanvas");
                if (oCanvas) {
                    var ctx = oCanvas.getContext("2d");
                    ctx.clearRect(0, 0, oCanvas.width, oCanvas.height);
                }
            };
            oController.onCancelSignature = function () {
                if (oController._pSignatureDialog) {
                    oController._pSignatureDialog.then(function (oDialog) { oDialog.close(); });
                }
            };
            oController.onConfirmSignature = function () {
                var oView = oController.getView();
                var oViewData = oView.getModel("viewData");
                var iLevel = oViewData.getProperty("/currentApprovalLevel");
                var oCanvas = document.getElementById("signatureCanvas");
                var dataUrl = oCanvas ? oCanvas.toDataURL() : null;
                // Store signature data in approval model
                var oApprovalModel = oView.getModel("approvalModel");
                if (oApprovalModel && dataUrl) {
                    oApprovalModel.setProperty("/investorSignature", dataUrl);
                }
                // Update sign status
                var oSignStatus = oViewData.getProperty("/signStatus");
                var oBundle = oController.getView().getModel("i18n").getResourceBundle();
                var signerName = oBundle.getText("signedPlaceholder");

                var oComponent = oController.getOwnerComponent();
                if (oComponent) {
                    var oUserModel = oComponent.getModel("userModel");
                    if (oUserModel) {
                        signerName = oUserModel.getProperty("/userName") || oUserModel.getProperty("/userId") || oBundle.getText("signedPlaceholder");
                    }
                }

                if (iLevel === 1) {
                    oSignStatus.level1 = { text: signerName, signed: true };
                    oViewData.setProperty("/canApproveLevel1", false);
                } else if (iLevel === 2) {
                    oSignStatus.level2 = { text: signerName, signed: true };
                    oViewData.setProperty("/canApproveLevel2", false);
                } else if (iLevel === 3) {
                    oSignStatus.level3 = { text: signerName, signed: true };
                    oViewData.setProperty("/canApproveLevel3", false);
                }
                oViewData.setProperty("/signStatus", oSignStatus);
                // Close dialog
                if (oController._pSignatureDialog) {
                    oController._pSignatureDialog.then(function (oDialog) { oDialog.close(); });
                }
                // Proceed with approval action
                oController.onApproveFromReport();
            };

            // Local model for logs
            var oLogListModel = new JSONModel([]);
            oController.getView().setModel(oLogListModel, "logListModel");

            // Local model for signature data
            var oApprovalModel = new JSONModel({
                ui: { isSelected: false },
                selectedLog: null,
                investorSignature: null
            });
            oController.getView().setModel(oApprovalModel, "approvalModel");

            // Local model for ProcessFlow
            var oPfModel = new JSONModel({ nodes: [], lanes: [] });
            oController.getView().setModel(oPfModel, "pfModel");

            // ── REACTIVITY: Watch for User ID changes and re-filter ──
            var oComponent = oController.getOwnerComponent();
            var oUserModel = oComponent ? oComponent.getModel("userModel") : null;
            if (oUserModel) {
                oUserModel.attachPropertyChange(function (oEvent) {
                    if (oEvent.getParameter("path") === "/userId" && oController._sCurrentWbsId) {
                        console.log("ApprovalLogDelegate: Identity changed, re-syncing logs...");
                        oController._bindApprovalLogList(oController._sCurrentWbsId);
                    }
                });
            }
        },

        /* =========================================================== */
        /* DATA BINDING                                                 */
        /* =========================================================== */

        /**
         * Binds the approval log list for a given WBS ID.
         * Waits for the SecurityDelegate promise to ensure we have a valid user ID.
         */
        _bindApprovalLogList: function (sWbsId, bSilent) {
            var that = this;
            var oView = this.getView();
            var oComponent = this.getOwnerComponent();
            var oModel = oView.getModel();
            var oLogListModel = oView.getModel("logListModel");
            var oUserModel = oComponent.getModel("userModel");

            this._sCurrentWbsId = sWbsId;

            // Clear old logs while identifying (only if not silent)
            if (oLogListModel && !bSilent) oLogListModel.setData([]);

            // ── SYNC: Wait for identity resolution before fetching/filtering ──
            if (oComponent.SecurityDelegate && oComponent.SecurityDelegate.whenUserIdentified) {
                oComponent.SecurityDelegate.whenUserIdentified().then(function (sUserId) {
                    if (!bSilent) console.log("ApprovalLog: Session confirmed for " + sUserId + ", binding logs...");
                    this._doLoadAndFilter(sWbsId, bSilent);
                }.bind(this));
            } else {
                this._doLoadAndFilter(sWbsId, bSilent);
            }
        },

        /**
         * Internal: Fetches logs and filters for the current local user ID.
         */
        _doLoadAndFilter: function (sWbsId, bSilent) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var oLogListModel = oView.getModel("logListModel");
            var oUserModel = this.getOwnerComponent().getModel("userModel");

            if (!bSilent) {
                oView.setBusy(true);
            }

            oModel.read("/ApprovalLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                sorters: [new sap.ui.model.Sorter("CreatedTimestamp", false)], // Newest first
                urlParameters: {
                    "cb": new Date().getTime() // Cache buster
                },
                success: function (oData) {
                    if (!bSilent) {
                        oView.setBusy(false);
                    }
                    var aLogs = oData.results || [];

                    // Force WbsId filter natively because backend ignores the API filter
                    var aGlobalLogs = aLogs.filter(function (log) {
                        return log.WbsId && log.WbsId.toLowerCase() === sWbsId.toLowerCase();
                    });

                    // Store globally for WBSDetail dataReceived fallback
                    oView.getController()._aGlobalLogs = aGlobalLogs;

                    // Generate ProcessFlow data BEFORE filtering out other users' logs
                    if (typeof oView.getController().updateProcessFlow === "function") {
                        oView.getController().updateProcessFlow(aGlobalLogs);
                    }

                    // Show ALL logs regardless of User ID
                    aLogs = aGlobalLogs;

                    if (oLogListModel) oLogListModel.setData(aLogs);

                    // Async fetch user names to replace user IDs in the list
                    if (oLogListModel) {
                        aLogs.forEach(function (oLog) {
                            var sUserId = oLog.ActionBy || oLog.CreatedBy;
                            if (!sUserId) return;

                            var sPath = "/UserRoleSet('" + sUserId + "')";
                            var sUserName = oModel.getProperty(sPath + "/UserName");

                            if (sUserName) {
                                oLog.ActionBy = sUserName;
                                oLogListModel.refresh(true);
                            } else {
                                oModel.read(sPath, {
                                    success: function (oUserData) {
                                        oLog.ActionBy = oUserData.UserName;
                                        oLogListModel.refresh(true);
                                    }
                                });
                            }
                        });
                    }

                    // Re-init canvas after load
                    setTimeout(function () { this._initInvestorCanvas(); }.bind(this), 200);
                }.bind(this),
                error: function () {
                    oView.setBusy(false);
                    if (oLogListModel) oLogListModel.setData([]);
                }
            });
        },

        /* =========================================================== */
        /* PROCESS FLOW LOGIC                                           */
        /* =========================================================== */

        updateProcessFlow: function (aGlobalLogs) {
            var oView = this.getView();
            var oPfModel = oView.getModel("pfModel");
            var oCtx = oView.getBindingContext();
            var sStatus = oCtx ? oCtx.getProperty("Status") : "";

            if (!aGlobalLogs) aGlobalLogs = [];

            // Helper to find latest log matching conditions in the CURRENT cycle
            var findLatestLog = function (sType, sAction) {
                var aActiveLogs = getActiveLogsForType(sType);
                var found = aActiveLogs.find(function (l) {
                    return l.Action === sAction;
                });
                return found;
            };

            var formatDate = function (vDate) {
                if (!vDate) return "";
                var d = (vDate instanceof Date) ? vDate : new Date(vDate);
                if (isNaN(d.getTime())) return "";
                return d.getDate().toString().padStart(2, '0') + '/' +
                    (d.getMonth() + 1).toString().padStart(2, '0') + '/' +
                    d.getFullYear();
            };

            var formatLogInfo = function (oLog, bIncludeName) {
                var oBundle = oView.getModel("i18n").getResourceBundle();
                if (!oLog) return [];
                var sDateString = formatDate(oLog.CreatedTimestamp);
                
                if (bIncludeName === false) {
                    return [sDateString].filter(Boolean);
                }
                var sName = oLog.ActionBy || oLog.CreatedBy || "";
                return [sName, sDateString].filter(Boolean);
            };

            // Always show all lanes.
            // laneState controls the lane header circle color explicitly (bound in XML via {pfModel>laneState})
            // 'Initial' = default, 'Error' = fully red circle (override when rejected)
            var sDefaultLaneState = "Initial";
            var oBundle = oView.getModel("i18n").getResourceBundle();
            var aLanes = [
                { id: "lane0", icon: "sap-icon://status-in-process", label: oBundle.getText("planningStepLabel"),      position: 0, laneState: sDefaultLaneState },
                { id: "lane1", icon: "sap-icon://paper-plane",        label: oBundle.getText("pendingOpenStepLabel"),  position: 1, laneState: sDefaultLaneState },
                { id: "lane2", icon: "sap-icon://accept",             label: oBundle.getText("openedStepLabel"),        position: 2, laneState: sDefaultLaneState },
                { id: "lane3", icon: "sap-icon://machine",            label: oBundle.getText("inProgressStepLabel"),   position: 3, laneState: sDefaultLaneState },
                { id: "lane4", icon: "sap-icon://paper-plane",        label: oBundle.getText("pendingCloseStepLabel"), position: 4, laneState: sDefaultLaneState },
                { id: "lane5", icon: "sap-icon://locked",             label: oBundle.getText("closedStepLabel"),        position: 5, laneState: sDefaultLaneState }
            ];

            // Default Mapping
            var state0 = "Planned", state1 = "Planned", state2 = "Planned", state3 = "Planned", state4 = "Planned", state5 = "Planned";
            var text0 = "Pending", text1 = "Pending", text2 = "Pending", text3 = "Pending", text4 = "Pending", text5 = "Pending";

            // State evaluation
            switch (sStatus) {
                case "PLANNING":
                    state0 = "Positive"; text0 = oBundle.getText("nodePublished");
                    break;
                case "PENDING_OPEN":
                    state0 = "Positive"; text0 = oBundle.getText("nodePublished");
                    state1 = "Neutral"; text1 = oBundle.getText("nodeInReview");
                    break;
                case "OPENED":
                    state0 = "Positive"; text0 = oBundle.getText("nodePublished");
                    state1 = "Positive"; text1 = oBundle.getText("nodePublished");
                    state2 = "Positive"; text2 = oBundle.getText("nodeActived");
                    break;
                case "IN_PROGRESS":
                    state0 = "Positive"; text0 = oBundle.getText("nodePublished");
                    state1 = "Positive"; text1 = oBundle.getText("nodePublished");
                    state2 = "Positive"; text2 = oBundle.getText("nodeActived");
                    state3 = "Positive"; text3 = oBundle.getText("nodeStarted");
                    break;
                case "PENDING_CLOSE":
                    state0 = "Positive"; state1 = "Positive"; state2 = "Positive"; state3 = "Positive";
                    text0 = oBundle.getText("nodePublished"); text1 = oBundle.getText("nodePublished"); text2 = oBundle.getText("nodeActived"); text3 = oBundle.getText("nodeStarted");
                    state4 = "Neutral"; text4 = oBundle.getText("nodeInReview");
                    break;
                case "CLOSED":
                    state0 = "Positive"; state1 = "Positive"; state2 = "Positive"; state3 = "Positive"; state4 = "Positive"; state5 = "Positive";
                    text0 = oBundle.getText("nodePublished"); text1 = oBundle.getText("nodePublished"); text2 = oBundle.getText("nodeActived"); text3 = oBundle.getText("nodeStarted"); text4 = oBundle.getText("nodePublished"); text5 = oBundle.getText("nodeCompleted");
                    break;
                default:
                    state0 = "Neutral"; text0 = "Unknown";
            }

            var getInfoForLane = function (laneIdx, bIncludeName) {
                var oLog;
                if (laneIdx === 2) { // Opened
                    oLog = findLatestLog("OPEN", "APPROVED");
                } else if (laneIdx === 5) { // Closed
                    oLog = findLatestLog("CLOSE", "APPROVED");
                }
                return formatLogInfo(oLog, bIncludeName);
            };

            var isApproveAction = function (act) {
                return act.indexOf("PHÊ DUYỆT YÊU CẦU ĐÓNG WBS") >= 0
                    || act.indexOf("PHÊ DUYỆT YÊU CẦU MỞ WBS") >= 0
                    || act === "0001" || act === "APPROVED" || act === "SUCCESS"
                    || act === "ĐÃ PHÊ DUYỆT" || act === "KÝ DUYÊT"
                    || act.indexOf("CHẤP THUẬN") >= 0;
            };
            var isRejectAction = function (act) {
                return act === "0002"
                    || act === "REJECTED"
                    || act === "ERROR"
                    || act.indexOf("TỪ CHỐI") >= 0
                    || act.indexOf("REJECT") >= 0
                    || act.indexOf("ĐÃ TỪ CHỐI") >= 0;
            };

            // Helper to get only logs from the CURRENT cycle
            var getActiveLogsForType = function (sType) {
                var aTypeLogs = aGlobalLogs.filter(function(l) { return l.ApprovalType === sType; });
                
                // Ensure logs are sorted descending (newest first)
                aTypeLogs.sort(function (a, b) {
                    var tA = a.CreatedTimestamp ? parseInt((a.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                    var tB = b.CreatedTimestamp ? parseInt((b.CreatedTimestamp.toString() || "").replace(/[^0-9]/g, ""), 10) || 0 : 0;
                    return tB - tA;
                });

                var iSubmitIndex = -1;
                for (var i = 0; i < aTypeLogs.length; i++) {
                    var act = (aTypeLogs[i].Action || "").toUpperCase().trim();
                    var bIsSubmit = act === "0000" || act === "SUBMITTED" || act === "TẠO WBS";
                    if (bIsSubmit || (act.indexOf("GỬI") !== -1 && act.indexOf("YÊU CẦU") !== -1)) {
                        iSubmitIndex = i;
                        break;
                    }
                }
                if (iSubmitIndex >= 0) {
                    return aTypeLogs.slice(0, iSubmitIndex + 1);
                }
                return aTypeLogs;
            };

            var getLevelNodeInfo = function (sType, iLevel, overallState) {
                var aActiveLogs = getActiveLogsForType(sType);
                // Find the most recent log for this approval type + level that is a decision in the ACTIVE cycle
                var oLog = null;
                for (var i = 0; i < aActiveLogs.length; i++) {
                    var l = aActiveLogs[i];
                    var act = (l.Action || "").toUpperCase().trim();
                    var lvlMatch = parseInt(l.ApprovalLevel) === iLevel || String(l.ApprovalLevel) === String(iLevel);
                    if (lvlMatch && (isApproveAction(act) || isRejectAction(act))) {
                        oLog = l;
                        break; // logs sorted newest-first
                    }
                }

                // If the overall phase hasn't started yet (Planned state) then show pending
                if (overallState === "Planned") {
                    return { state: "Planned", text: oBundle.getText("actionStatusPending"), texts: [] };
                }

                if (oLog) {
                    var act2 = (oLog.Action || "").toUpperCase().trim();
                    // Show correct state per what this person actually did
                    if (isApproveAction(act2)) {
                        return { state: "Positive", text: oBundle.getText("actionStatusApproved"), texts: formatLogInfo(oLog, true) };
                    } else {
                        return { state: "Negative", text: oBundle.getText("actionStatusRejected"), texts: formatLogInfo(oLog, true) };
                    }
                } else {
                    // No log for this level — show neutral, no personal info
                    return { state: "Neutral", text: "", texts: [] };
                }
            };

            // Custom texts for Planning node
            var aPlanningTexts = [];
            if (oCtx) {
                var dCreated = oCtx.getProperty("CreatedTimestamp");
                var dPlannedEnd = oCtx.getProperty("EndDate");
                if (dCreated) aPlanningTexts.push(oBundle.getText("nodeCreatedOn", [formatDate(dCreated)]));
                if (dPlannedEnd) aPlanningTexts.push(oBundle.getText("nodePlannedEnd", [formatDate(dPlannedEnd)]));
            }

            var aNodes = [
                { id: "node0", lane: "lane0", title: oBundle.getText("nodePlanning"), state: state0, stateText: text0, texts: aPlanningTexts, children: ["node1_1"] }
            ];

            // Pending Open Nodes (3 Levels)
            [1, 2, 3].forEach(function (lvl) {
                var info = getLevelNodeInfo("OPEN", lvl, state1);
                var nextNodeId = lvl === 3 ? "node2" : "node1_" + (lvl + 1);
                aNodes.push({
                    id: "node1_" + lvl,
                    lane: "lane1",
                    title: oBundle.getText("nodeApprovedLevel", [lvl]),
                    state: info.state,
                    stateText: info.text,
                    texts: info.texts,
                    children: [nextNodeId]
                });
            });

            // Opened Node
            aNodes.push({ id: "node2", lane: "lane2", title: oBundle.getText("nodeOpened"), state: state2, stateText: text2, texts: getInfoForLane(2, false), children: ["node3"] });
            
            // In Progress Node
            var aInProgressTexts = [];
            if (oCtx && oCtx.getProperty("StartActual")) {
                aInProgressTexts = [formatDate(oCtx.getProperty("StartActual"))];
            }
            aNodes.push({ id: "node3", lane: "lane3", title: oBundle.getText("nodeInProgress"), state: state3, stateText: text3, texts: aInProgressTexts, children: ["node4_1"] });

            // Pending Close Nodes (3 Levels)
            [1, 2, 3].forEach(function (lvl) {
                var info = getLevelNodeInfo("CLOSE", lvl, state4);
                var nextNodeId = lvl === 3 ? "node5" : "node4_" + (lvl + 1);
                aNodes.push({
                    id: "node4_" + lvl,
                    lane: "lane4",
                    title: oBundle.getText("nodePendingCloseLevel", [lvl]),
                    state: info.state,
                    stateText: info.text,
                    texts: info.texts,
                    children: [nextNodeId]
                });
            });

            // Closed Node
            aNodes.push({ id: "node5", lane: "lane5", title: oBundle.getText("nodeCompleted"), state: state5, stateText: text5, texts: getInfoForLane(5, false), children: [] });

            if (oPfModel) {
                oPfModel.setData({
                    lanes: aLanes,
                    nodes: aNodes
                });
                oPfModel.refresh(true);

                var oProcessFlow = oView.byId("wbsProcessFlow");
                if (oProcessFlow && typeof oProcessFlow.updateModel === "function") {
                    oProcessFlow.updateModel();
                }
            }
        },

        /* =========================================================== */
        /* FORMATTERS                                                   */
        /* =========================================================== */

        formatApprovalActionText: function (sAction) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            switch (sAction) {
                case "SUBMITTED": return oBundle.getText("actionStatusPending");
                case "APPROVED": return oBundle.getText("actionStatusApproved");
                case "REJECTED": return oBundle.getText("actionStatusRejected");
                default: return sAction || "";
            }
        },

        formatApprovalActionState: function (sAction) {
            switch (sAction) {
                case "SUBMITTED": return "Warning";
                case "APPROVED": return "Success";
                case "REJECTED": return "Error";
                default: return "None";
            }
        },

        formatApprovalActionIcon: function (sAction) {
            switch (sAction) {
                case "SUBMITTED": return "sap-icon://paper-plane";
                case "APPROVED": return "sap-icon://accept";
                case "REJECTED": return "sap-icon://decline";
                default: return "sap-icon://sys-help";
            }
        },

        /* =========================================================== */
        /* LIST SELECTION                                               */
        /* =========================================================== */

        onLogSelectionChange: function (oEvent) {
            // No longer used in the new Dialog-based UX
        },

        /* =========================================================== */
        /* INLINE CANVAS SIGNATURE                                     */
        /* =========================================================== */

        _initInvestorCanvas: function () {
            var that = this;
            var oCanvas = document.getElementById("investorCanvas");

            if (!oCanvas) {
                requestAnimationFrame(function () { that._initInvestorCanvas(); });
                return;
            }

            var isDrawing = false;
            var oNew = oCanvas.cloneNode(true);
            oCanvas.parentNode.replaceChild(oNew, oCanvas);

            var ctx = oNew.getContext("2d");
            ctx.strokeStyle = "#1a2c42";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            oNew.addEventListener("mousedown", function (e) {
                e.preventDefault();
                isDrawing = true;
                var r = oNew.getBoundingClientRect();
                ctx.beginPath();
                ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
            });
            oNew.addEventListener("mousemove", function (e) {
                if (!isDrawing) { return; }
                var r = oNew.getBoundingClientRect();
                ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
                ctx.stroke();
            });
            oNew.addEventListener("mouseup", function () { isDrawing = false; });
            oNew.addEventListener("mouseleave", function () { isDrawing = false; });
            oNew.addEventListener("touchstart", function (e) {
                e.preventDefault();
                isDrawing = true;
                var r = oNew.getBoundingClientRect();
                var t = e.touches[0];
                ctx.beginPath();
                ctx.moveTo(t.clientX - r.left, t.clientY - r.top);
            }, { passive: false });
            oNew.addEventListener("touchmove", function (e) {
                e.preventDefault();
                if (!isDrawing) { return; }
                var r = oNew.getBoundingClientRect();
                var t = e.touches[0];
                ctx.lineTo(t.clientX - r.left, t.clientY - r.top);
                ctx.stroke();
            }, { passive: false });
            oNew.addEventListener("touchend", function () { isDrawing = false; });

            var oClearBtn = document.getElementById("clearInvestorCanvas");
            if (oClearBtn) {
                var oNewBtn = oClearBtn.cloneNode(true);
                oClearBtn.parentNode.replaceChild(oNewBtn, oClearBtn);
                oNewBtn.addEventListener("click", function (e) {
                    e.preventDefault();
                    ctx.clearRect(0, 0, oNew.width, oNew.height);
                });
            }
        }
    };
});
