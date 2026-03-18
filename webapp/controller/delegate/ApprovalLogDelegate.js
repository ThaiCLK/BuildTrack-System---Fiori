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
        _bindApprovalLogList: function (sWbsId) {
            var that = this;
            var oView = this.getView();
            var oComponent = this.getOwnerComponent();
            var oModel = oView.getModel();
            var oLogListModel = oView.getModel("logListModel");
            var oUserModel = oComponent.getModel("userModel");

            this._sCurrentWbsId = sWbsId;

            // Clear old logs while identifying
            if (oLogListModel) oLogListModel.setData([]);

            // ── SYNC: Wait for identity resolution before fetching/filtering ──
            if (oComponent.SecurityDelegate && oComponent.SecurityDelegate.whenUserIdentified) {
                oComponent.SecurityDelegate.whenUserIdentified().then(function (sUserId) {
                    console.log("ApprovalLog: Session confirmed for " + sUserId + ", binding logs...");
                    this._doLoadAndFilter(sWbsId);
                }.bind(this));
            } else {
                this._doLoadAndFilter(sWbsId);
            }
        },

        /**
         * Internal: Fetches logs and filters for the current local user ID.
         */
        _doLoadAndFilter: function (sWbsId) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var oLogListModel = oView.getModel("logListModel");
            var oUserModel = this.getOwnerComponent().getModel("userModel");

            oView.setBusy(true);

            oModel.read("/ApprovalLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                sorters: [new sap.ui.model.Sorter("CreatedTimestamp", false)], // Newest first
                success: function (oData) {
                    oView.setBusy(false);
                    var aLogs = oData.results || [];
                    
                    // Filter logs by current user ID
                    var sCurrentUserId = oUserModel ? oUserModel.getProperty("/userId") : null;
                    if (sCurrentUserId) {
                        aLogs = aLogs.filter(function(log) {
                            var author = log.ActionBy || log.CreatedBy;
                            return author === sCurrentUserId;
                        });
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
