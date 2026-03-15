sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
    "use strict";

    var WorkSummaryDelegate = {
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
         * Aggregate total QuantityDone from all DailyLogs for this WBS.
         * Robust handling: Fetches the WBS record first to determine if it's a parent/child,
         * avoiding race conditions with view binding context during navigation.
         */
        _loadWorkSummary: function (sWbsId) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oWSModel = this.getView().getModel("workSummaryModel");

            // 1. Reset model immediately to clear stale data from previous navigation
            oWSModel.setData({
                TotalQtyDone: "0",
                Children: [],
                WbsId: sWbsId
            });

            // 2. Fetch the WBS record to get the ABSOLUTE LATEST ParentId for this ID
            oModel.read("/WBSSet(guid'" + sWbsId + "')", {
                success: function (oWbs) {
                    var bIsParent = false;
                    var vParentId = oWbs.ParentId;
                    
                    if (!vParentId) {
                        bIsParent = true;
                    } else {
                        var sClean = vParentId.toString().replace(/-/g, "");
                        if (/^0+$/.test(sClean)) bIsParent = true;
                    }

                    if (bIsParent) {
                        // 3. Parent Branch: Calculate aggregate from children
                        WorkSummaryDelegate._loadParentAggregation.call(that, sWbsId, oWSModel, oModel);
                    } else {
                        // 4. Leaf Node Branch: Aggregate logs for THIS WBS
                        WorkSummaryDelegate._loadLeafNodeAggregation.call(that, sWbsId, oWSModel, oModel);
                    }
                },
                error: function () {
                    console.error("Failed to load WBS metadata for Work Summary:", sWbsId);
                }
            });
        },

        _loadParentAggregation: function(sWbsId, oWSModel, oModel) {
            oModel.read("/WBSSet", {
                filters: [new Filter("ParentId", FilterOperator.EQ, sWbsId)],
                urlParameters: {
                    "$expand": "ToApprovalLog"
                },
                success: function (oData) {
                    var sNormParentId = sWbsId.toLowerCase().replace(/-/g, "");
                    var aChildren = (oData.results || []).filter(function(w) {
                        if (!w.ParentId) return false;
                        return w.ParentId.toLowerCase().replace(/-/g, "") === sNormParentId;
                    });
                    
                    if (aChildren.length === 0) {
                        oWSModel.setProperty("/Children", []);
                        return;
                    }

                    var iProcessed = 0;
                    aChildren.forEach(function (oChild) {
                        oModel.read("/DailyLogSet", {
                            filters: [new Filter("WbsId", FilterOperator.EQ, oChild.WbsId)],
                            success: function (oLogData) {
                                var fSum = 0;
                                (oLogData.results || []).forEach(function (l) {
                                    fSum += parseFloat(l.QuantityDone) || 0;
                                });
                                oChild.TotalQtyDone = fSum.toFixed(3);
                                
                                iProcessed++;
                                if (iProcessed === aChildren.length) {
                                    var fParentAggregate = 0;
                                    aChildren.forEach(function(c) {
                                        fParentAggregate += parseFloat(c.TotalQtyDone) || 0;
                                    });
                                    
                                    oWSModel.setData({
                                        Children: aChildren,
                                        TotalQtyDone: fParentAggregate.toFixed(3),
                                        WbsId: sWbsId
                                    });
                                }
                            },
                            error: function () {
                                iProcessed++;
                                if (iProcessed === aChildren.length) {
                                    oWSModel.setProperty("/Children", aChildren);
                                }
                            }
                        });
                    });
                },
                error: function () {
                    oWSModel.setProperty("/Children", []);
                }
            });
        },

        _loadLeafNodeAggregation: function(sWbsId, oWSModel, oModel) {
            var that = this;
            oModel.read("/DailyLogSet", {
                filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                success: function (oData) {
                    var fTotal = 0;
                    (oData.results || []).forEach(function (oLog) {
                        fTotal += parseFloat(oLog.QuantityDone) || 0;
                    });

                    oWSModel.setData({
                        TotalQtyDone: fTotal.toFixed(3),
                        WbsId: sWbsId,
                        Children: []
                    });

                    if (typeof that._bindApprovalLogList === "function") {
                        that._bindApprovalLogList(sWbsId);
                    }
                },
                error: function () {
                    console.error("Failed to aggregate logs for leaf WBS:", sWbsId);
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
                return "0%";
            }
            return ((fActual / fTarget) * 100).toFixed(0) + "%";
        },

        formatProgress: function (sActual, sTarget) {
            var fActual = parseFloat(sActual);
            var fTarget = parseFloat(sTarget);
            if (isNaN(fActual) || isNaN(fTarget) || fTarget === 0) {
                return 0;
            }
            var fPercent = (fActual / fTarget) * 100;
            return Math.min(fPercent, 100);
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
            return sActual.toString(); 
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

    return WorkSummaryDelegate;
});
