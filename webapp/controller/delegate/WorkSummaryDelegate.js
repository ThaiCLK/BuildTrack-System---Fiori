sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
    "use strict";

    return {
        init: function (oController) {
            oController._loadWorkSummary = this._loadWorkSummary.bind(oController);
            oController.formatPercentage = this.formatPercentage.bind(oController);
            oController.formatProgress = this.formatProgress.bind(oController);
            oController.formatQuantityState = this.formatQuantityState.bind(oController);
            oController.formatProgressDisplay = this.formatProgressDisplay.bind(oController);
            oController.formatTotalQty = this.formatTotalQty.bind(oController);
            oController.formatWorkSummaryStatusState = this.formatWorkSummaryStatusState.bind(oController);
            oController.formatWorkSummaryStatusIcon = this.formatWorkSummaryStatusIcon.bind(oController);
            oController.onSubmitForApproval = this.onSubmitForApproval.bind(oController);
        },

        /**
         * Aggregate total QuantityDone from all DailyLogs for this WBS (FE-side sum).
         * Also reads WBS Status for Work Summary status display.
         * Called after saving/deleting a log so the view updates immediately.
         */
        _loadWorkSummary: function (sWbsId) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oWSModel = this.getView().getModel("workSummaryModel");

            // Read all DailyLogs for this WBS and sum QuantityDone
            oModel.read("/DailyLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    var fTotal = 0;
                    (oData.results || []).forEach(function (oLog) {
                        fTotal += parseFloat(oLog.QuantityDone) || 0;
                    });

                    // Merge into workSummaryModel, keeping existing WBS fields (Status etc.)
                    var oExisting = oWSModel.getData() || {};
                    oWSModel.setData(Object.assign({}, oExisting, {
                        TotalQtyDone: fTotal.toFixed(3),
                        TotalQuantityDone: fTotal.toFixed(3),
                        WbsId: sWbsId
                    }));

                    if (typeof that._bindApprovalLogList === "function") {
                        that._bindApprovalLogList(sWbsId);
                    }
                },
                error: function () {
                    console.error("Failed to aggregate DailyLogs for WBS:", sWbsId);
                }
            });
        },

        /* =========================================================== */
        /* Formatter Methods for Work Summary                          */
        /* =========================================================== */

        formatPercentage: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return "0.0%";
            }
            return ((fActual / fTarget) * 100).toFixed(1) + "%";
        },

        formatProgress: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return 0;
            }
            return (fActual / fTarget) * 100;
        },

        formatQuantityState: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return "Warning";
            }
            return fActual >= fTarget ? "Success" : "Warning";
        },

        formatProgressDisplay: function (sActual, sTarget, sUnit) {
            var fActual = parseFloat(sActual) || 0;
            var fTarget = parseFloat(sTarget) || 0;
            var sU = sUnit ? " " + sUnit : "";
            return fActual + " / " + fTarget + sU;
        },

        formatTotalQty: function (sActual) {
            if (sActual === undefined || sActual === null || sActual === "") {
                return "0";
            }
            var fActual = parseFloat(sActual);
            if (isNaN(fActual)) return "0";
            return sActual.toString(); // Keep original string with decimals if provided
        },

        formatWorkSummaryStatusState: function (sStatus) {
            switch (sStatus) {
                case "DRAFT":
                case "DRAFTED": return "None";
                case "SUBMITTED": return "Information";
                case "APPROVED": return "Success";
                case "REJECTED": return "Error";
                default: return "None";
            }
        },

        formatWorkSummaryStatusIcon: function (sStatus) {
            switch (sStatus) {
                case "DRAFT":
                case "DRAFTED": return "sap-icon://document";
                case "SUBMITTED": return "sap-icon://paper-plane";
                case "APPROVED": return "sap-icon://accept";
                case "REJECTED": return "sap-icon://decline";
                default: return "sap-icon://sys-help";
            }
        },



        onSubmitForApproval: function () {
            var oView = this.getView();
            var oWSModel = oView.getModel("workSummaryModel");
            var oWbsCtx = oView.getBindingContext();

            if (!oWbsCtx) {
                return;
            }

            var fTargetQty = parseFloat(oWbsCtx.getProperty("Quantity")) || 0;
            var fTotalDone = parseFloat(oWSModel.getProperty("/TotalQtyDone")) || 0;
            var sWbsId = this._sWbsId;

            var fnCallAction = function () {
                var oModel = this.getOwnerComponent().getModel();
                oView.setBusy(true);

                oModel.callFunction("/StartWSProcess", {
                    method: "POST",
                    urlParameters: {
                        WS_ID: sWbsId
                    },
                    success: function (oData, response) {
                        oView.setBusy(false);

                        // The OData action might return 200 OK but with a SUCCESS=false payload
                        if (oData && oData.SUCCESS === false) {
                            sap.m.MessageBox.error(oData.MESSAGE || "Failed to submit for approval.");
                            return;
                        }

                        sap.m.MessageBox.success(oData.MESSAGE || "Work Summary submitted for approval successfully.");
                        // Refresh to reflect the new Status
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
            }.bind(this);

            if (fTotalDone < fTargetQty) {
                sap.m.MessageBox.confirm(
                    "Số liệu công việc thực tế chưa đạt được bằng so với kế hoạch. Bạn có chắc chắn muốn submit không?",
                    {
                        title: "Confirm Submission",
                        onClose: function (sAction) {
                            if (sAction === sap.m.MessageBox.Action.OK) {
                                fnCallAction();
                            }
                        }
                    }
                );
            } else {
                fnCallAction();
            }
        }
    };
});
