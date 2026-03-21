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
                        name: "z.bts.buildtrack.view.fragments.SignatureDialog",
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
                var signerName = "[Ký]"; // fallback

                var oComponent = oController.getOwnerComponent();
                if (oComponent) {
                    var oUserModel = oComponent.getModel("userModel");
                    if (oUserModel) {
                        signerName = oUserModel.getProperty("/userName") || oUserModel.getProperty("/userId") || "[Ký]";
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

                    // Filter logs by current user ID for the bottom list
                    var sCurrentUserId = oUserModel ? oUserModel.getProperty("/userId") : null;
                    if (sCurrentUserId) {
                        aLogs = aGlobalLogs.filter(function (log) {
                            var author = log.ActionBy || log.CreatedBy;
                            return author === sCurrentUserId;
                        });
                    } else {
                        aLogs = aGlobalLogs;
                    }

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

            // Helper to find latest log matching conditions
            var findLatestLog = function (sType, sAction) {
                var found = aGlobalLogs.find(function (l) {
                    return l.ApprovalType === sType && l.Action === sAction;
                });
                return found;
            };

            var formatLogInfo = function (oLog) {
                if (!oLog) return [];
                var sName = oLog.ActionBy || oLog.CreatedBy || "";
                var dDate = oLog.CreatedTimestamp ? new Date(oLog.CreatedTimestamp) : null;
                var sDateString = dDate ? (dDate.getDate().toString().padStart(2, '0') + '/' +
                    (dDate.getMonth() + 1).toString().padStart(2, '0') + '/' +
                    dDate.getFullYear()) : "";
                return [sName, sDateString].filter(Boolean);
            };

            var iMaxVisibleLane = 5;
            switch (sStatus) {
                case "PLANNING": iMaxVisibleLane = 0; break;
                case "PENDING_OPEN":
                case "OPEN_REJECTED": iMaxVisibleLane = 1; break;
                case "OPENED": iMaxVisibleLane = 2; break;
                case "IN_PROGRESS": iMaxVisibleLane = 3; break;
                case "PENDING_CLOSE":
                case "CLOSE_REJECTED": iMaxVisibleLane = 4; break;
                case "CLOSED": iMaxVisibleLane = 5; break;
                default: iMaxVisibleLane = 0;
            }

            var aLanes = [
                { id: "lane0", icon: "sap-icon://status-in-process", label: "Planning", position: 0 },
                { id: "lane1", icon: "sap-icon://paper-plane", label: "Pending Open", position: 1 },
                { id: "lane2", icon: "sap-icon://accept", label: "Opened", position: 2 },
                { id: "lane3", icon: "sap-icon://machine", label: "In Progress", position: 3 },
                { id: "lane4", icon: "sap-icon://paper-plane", label: "Pending Close", position: 4 },
                { id: "lane5", icon: "sap-icon://locked", label: "Closed", position: 5 }
            ].filter(function (l) { return l.position <= iMaxVisibleLane; });

            // Default Mapping
            var state0 = "Planned", state1 = "Planned", state2 = "Planned", state3 = "Planned", state4 = "Planned", state5 = "Planned";
            var text0 = "Pending", text1 = "Pending", text2 = "Pending", text3 = "Pending", text4 = "Pending", text5 = "Pending";

            // State evaluation
            switch (sStatus) {
                case "PLANNING":
                    state0 = "Positive"; text0 = "Active";
                    break;
                case "PENDING_OPEN":
                    state0 = "Positive"; text0 = "Completed";
                    state1 = "Neutral"; text1 = "In Review";
                    break;
                case "OPEN_REJECTED":
                    state0 = "Positive"; text0 = "Completed";
                    state1 = "Negative"; text1 = "Rejected";
                    break;
                case "OPENED":
                    state0 = "Positive"; text0 = "Completed";
                    state1 = "Positive"; text1 = "Approved";
                    state2 = "Positive"; text2 = "Active";
                    break;
                case "IN_PROGRESS":
                    state0 = "Positive"; text0 = "Completed";
                    state1 = "Positive"; text1 = "Approved";
                    state2 = "Positive"; text2 = "Completed";
                    state3 = "Positive"; text3 = "Active";
                    break;
                case "PENDING_CLOSE":
                    state0 = "Positive"; state1 = "Positive"; state2 = "Positive"; state3 = "Positive";
                    text0 = "Completed"; text1 = "Approved"; text2 = "Completed"; text3 = "Completed";
                    state4 = "Neutral"; text4 = "In Review";
                    break;
                case "CLOSE_REJECTED":
                    state0 = "Positive"; state1 = "Positive"; state2 = "Positive"; state3 = "Positive";
                    text0 = "Completed"; text1 = "Approved"; text2 = "Completed"; text3 = "Completed";
                    state4 = "Negative"; text4 = "Rejected";
                    break;
                case "CLOSED":
                    state0 = "Positive"; state1 = "Positive"; state2 = "Positive"; state3 = "Positive"; state4 = "Positive"; state5 = "Positive";
                    text0 = "Completed"; text1 = "Approved"; text2 = "Completed"; text3 = "Completed"; text4 = "Approved"; text5 = "Completed";
                    break;
                default:
                    state0 = "Neutral"; text0 = "Unknown";
            }

            var getInfoForLane = function (laneIdx) {
                var oLog;
                if (laneIdx === 2) { // Opened
                    oLog = findLatestLog("OPEN", "APPROVED");
                } else if (laneIdx === 5) { // Closed
                    oLog = findLatestLog("CLOSE", "APPROVED");
                }
                return formatLogInfo(oLog);
            };

            var getLevelNodeInfo = function (sType, iLevel, overallState, overallText) {
                var oLog = aGlobalLogs.find(function (l) {
                    var act = (l.Action || "").toUpperCase().trim();
                    var isApprove = act.indexOf("PHÊ DUYỆT YÊU CẦU ĐÓNG WBS") >= 0 || act.indexOf("PHÊ DUYỆT YÊU CẦU MỞ WBS") >= 0 || act === "0001" || act === "APPROVED" || act === "SUCCESS" || act === "ĐÃ PHÊ DUYỆT" || act === "KÝ DUYÊT" || act.indexOf("CHẤP THUẬN") >= 0;
                    var isReject = act === "0002" || act === "REJECTED" || act === "ERROR" || act === "TỪ CHỐI";
                    return l.ApprovalType === sType && parseInt(l.ApprovalLevel) === iLevel && (isApprove || isReject);
                });

                var st = overallState;
                var txt = overallText;

                if (st === "Planned") {
                    return { state: "Planned", text: "Pending", texts: [] };
                }

                if (oLog) {
                    var act = (oLog.Action || "").toUpperCase().trim();
                    var isApp = act.indexOf("PHÊ DUYỆT YÊU CẦU ĐÓNG WBS") >= 0 || act.indexOf("PHÊ DUYỆT YÊU CẦU MỞ WBS") >= 0 || act === "0001" || act === "APPROVED" || act === "SUCCESS" || act === "ĐÃ PHÊ DUYỆT" || act === "KÝ DUYÊT" || act.indexOf("CHẤP THUẬN") >= 0;
                    if (isApp) {
                        st = "Positive"; txt = "Approved";
                    } else {
                        st = "Negative"; txt = "Rejected";
                    }
                    return { state: st, text: txt, texts: formatLogInfo(oLog) };
                } else {
                    if (st === "Positive") {
                        return { state: "Positive", text: "Approved", texts: [] };
                    } else if (st === "Negative") {
                        return { state: "Neutral", text: "Pending", texts: [] };
                    } else {
                        return { state: "Neutral", text: "In Review", texts: [] };
                    }
                }
            };

            var aNodes = [
                { id: "node0", lane: "lane0", title: "Kế hoạch", state: state0, stateText: text0, texts: [], children: iMaxVisibleLane >= 1 ? ["node1_1"] : [] }
            ];

            if (iMaxVisibleLane >= 1) {
                // Pending Open Nodes (3 Levels)
                [1, 2, 3].forEach(function (lvl) {
                    var info = getLevelNodeInfo("OPEN", lvl, state1, text1);
                    var nextNodeId = lvl === 3 ? "node2" : "node1_" + (lvl + 1);
                    if (lvl === 3 && iMaxVisibleLane < 2) nextNodeId = null;
                    aNodes.push({
                        id: "node1_" + lvl,
                        lane: "lane1",
                        title: "Trình duyệt Mở (Cấp " + lvl + ")",
                        state: info.state,
                        stateText: info.text,
                        texts: info.texts,
                        children: nextNodeId ? [nextNodeId] : []
                    });
                });
            }

            if (iMaxVisibleLane >= 2) {
                aNodes.push({ id: "node2", lane: "lane2", title: "Đã Mở", state: state2, stateText: text2, texts: getInfoForLane(2), children: iMaxVisibleLane >= 3 ? ["node3"] : [] });
            }
            
            if (iMaxVisibleLane >= 3) {
                aNodes.push({ id: "node3", lane: "lane3", title: "Đang Thi công", state: state3, stateText: text3, texts: [], children: iMaxVisibleLane >= 4 ? ["node4_1"] : [] });
            }

            if (iMaxVisibleLane >= 4) {
                // Pending Close Nodes (3 Levels)
                [1, 2, 3].forEach(function (lvl) {
                    var info = getLevelNodeInfo("CLOSE", lvl, state4, text4);
                    var nextNodeId = lvl === 3 ? "node5" : "node4_" + (lvl + 1);
                    if (lvl === 3 && iMaxVisibleLane < 5) nextNodeId = null;
                    aNodes.push({
                        id: "node4_" + lvl,
                        lane: "lane4",
                        title: "Nghiệm thu Đóng (Cấp " + lvl + ")",
                        state: info.state,
                        stateText: info.text,
                        texts: info.texts,
                        children: nextNodeId ? [nextNodeId] : []
                    });
                });
            }

            if (iMaxVisibleLane >= 5) {
                aNodes.push({ id: "node5", lane: "lane5", title: "Hoàn thành", state: state5, stateText: text5, texts: getInfoForLane(5), children: [] });
            }

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
            switch (sAction) {
                case "SUBMITTED": return "Chờ phê duyệt";
                case "APPROVED": return "Đã phê duyệt";
                case "REJECTED": return "Từ chối";
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
