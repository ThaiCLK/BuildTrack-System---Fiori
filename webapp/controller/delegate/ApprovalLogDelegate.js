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
            oController.onSignInvestorPress = function () { };
            oController.onClearSignature = function () { };
            oController.onCancelSignature = function () { };
            oController.onConfirmSignature = function () { };

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
                oComponent.SecurityDelegate.whenUserIdentified().then(function(sUserId) {
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
        _doLoadAndFilter: function(sWbsId) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var oLogListModel = oView.getModel("logListModel");
            var oUserModel = this.getOwnerComponent().getModel("userModel");

            oView.setBusy(true);

            oModel.read("/ApprovalLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                sorters: [new sap.ui.model.Sorter("CreatedTimestamp", true)],
                success: function (oData) {
                    oView.setBusy(false);
                    var aLogs = oData.results || [];
                    var sCurrentId = (oUserModel.getProperty("/userId") || "").toUpperCase().trim();
                    
                    var aFiltered = aLogs.filter(function (log) {
                        var sAction = (log.Action || "").toUpperCase();
                        var bIsTargetAction = sAction.indexOf("CHẤP THUẬN") !== -1 || sAction.indexOf("TỪ CHỐI") !== -1;
                        var bUserMatch = (log.ActionBy || "").toUpperCase().trim() === sCurrentId;
                        return bUserMatch && bIsTargetAction;
                    });

                    console.log("ApprovalLog: Fetched " + aLogs.length + " total. Sync'd to " + aFiltered.length + " for " + sCurrentId);
                    if (oLogListModel) oLogListModel.setData(aFiltered);
                    
                    // Re-init canvas after load
                    setTimeout(function() { this._initInvestorCanvas(); }.bind(this), 200);
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
            var that = this;
            var oModel = this.getView().getModel("approvalModel");

            var oItem = oEvent.getParameter("listItem");
            if (oItem) {
                var oContext = oItem.getBindingContext("logListModel");
                if (oContext) {
                    var oData = oContext.getObject();
                    oModel.setProperty("/selectedLog", oData);
                    oModel.setProperty("/ui/isSelected", true);
                } else {
                    oModel.setProperty("/selectedLog", {});
                    oModel.setProperty("/ui/isSelected", false);
                }
            } else {
                oModel.setProperty("/selectedLog", {});
                oModel.setProperty("/ui/isSelected", false);
            }

            var oCanvas = document.getElementById("investorCanvas");
            if (oCanvas) {
                oCanvas.getContext("2d").clearRect(0, 0, oCanvas.width, oCanvas.height);
                this._initInvestorCanvas();
            } else {
                setTimeout(function () { that._initInvestorCanvas(); }, 100);
            }
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
