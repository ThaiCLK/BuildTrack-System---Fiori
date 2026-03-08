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
            oController.formatApprovalActionText = this.formatApprovalActionText.bind(oController);
            oController.formatApprovalActionState = this.formatApprovalActionState.bind(oController);
            oController.formatApprovalActionIcon = this.formatApprovalActionIcon.bind(oController);
            oController.onLogSelectionChange = this.onLogSelectionChange.bind(oController);
            oController._initInvestorCanvas = this._initInvestorCanvas.bind(oController);
            // stubs for any old XML references
            oController.onSignInvestorPress = function () { };
            oController.onClearSignature = function () { };
            oController.onCancelSignature = function () { };
            oController.onConfirmSignature = function () { };
            oController.onInvestorCanvasRendered = function () { };

            // Local model for signature data
            var oApprovalModel = new JSONModel({ investorSignature: null });
            oController.getView().setModel(oApprovalModel, "approvalModel");
        },

        /* =========================================================== */
        /* DATA BINDING                                                 */
        /* =========================================================== */

        /**
         * Binds /ApprovalLogSet filtered by WbsId to the master list,
         * then schedules canvas init so the signature pad is ready.
         */
        _bindApprovalLogList: function (sWbsId) {
            var that = this;
            var oList = this.byId("idApprovalLogList");
            if (!oList) { return; }

            var oTemplate = new sap.m.StandardListItem({
                title: "{Action} - {ApprovalLevel}",
                description: "{ActionBy}",
                info: { path: "Action", formatter: this.formatApprovalActionText.bind(this) },
                infoState: { path: "Action", formatter: this.formatApprovalActionState.bind(this) },
                icon: { path: "Action", formatter: this.formatApprovalActionIcon.bind(this) }
            });

            oList.bindItems({
                path: "/ApprovalLogSet",
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                sorter: new sap.ui.model.Sorter("ActionOn", true),
                template: oTemplate,
                templateShareable: false
            });

            // Give the DOM time to render the inline canvas before wiring events
            setTimeout(function () { that._initInvestorCanvas(); }, 200);
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

        /**
         * Fires when the user picks a log entry in the master list.
         * Clears the signature canvas so each entry shows a fresh pad.
         */
        onLogSelectionChange: function () {
            var that = this;
            var oCanvas = document.getElementById("investorCanvas");
            if (oCanvas) {
                oCanvas.getContext("2d").clearRect(0, 0, oCanvas.width, oCanvas.height);
                // Always re-init so the cloned element keeps its events
                this._initInvestorCanvas();
            } else {
                setTimeout(function () { that._initInvestorCanvas(); }, 100);
            }
        },

        /* =========================================================== */
        /* INLINE CANVAS SIGNATURE                                     */
        /* =========================================================== */

        /**
         * Attaches freehand-drawing events to the inline investor canvas.
         * Uses a clone-and-replace pattern to cleanly remove stale listeners.
         */
        _initInvestorCanvas: function () {
            var that = this;
            var oCanvas = document.getElementById("investorCanvas");

            if (!oCanvas) {
                // Not in DOM yet – retry on next animation frame
                requestAnimationFrame(function () { that._initInvestorCanvas(); });
                return;
            }

            var isDrawing = false;

            // Clone removes any previously attached listeners
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

            // Re-wire the Clear button (also needs clone after canvas was replaced)
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
