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

            // Stepper Formatters
            oController.formatStepClass = this.formatStepClass.bind(oController);
            oController.formatStepLabelClass = this.formatStepLabelClass.bind(oController);
            oController.formatStepLineClass = this.formatStepLineClass.bind(oController);
            oController.formatStepIcon = this.formatStepIcon.bind(oController);
            oController.formatStepLabel = this.formatStepLabel.bind(oController);
            oController.formatCompletionRateTitle = this.formatCompletionRateTitle.bind(oController);
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

            // 1. Reset model immediately to clear stale data
            oWSModel.setData({
                TotalQtyDone: "0",
                Children: [],
                WbsId: sWbsId
            });

            this._sWorkSummaryToken = sWbsId;

            // 2. Wrap in Promise to coordinate with Global Refresh
            return new Promise(function(resolve, reject) {
                oModel.read("/WBSSet(guid'" + sWbsId + "')", {
                    success: function (oWbs) {
                        if (that._sWorkSummaryToken !== sWbsId) { return resolve(); }

                        var bIsParent = false;
                        var vParentId = oWbs.ParentId;

                        if (!vParentId) {
                            bIsParent = true;
                        } else {
                            var sClean = vParentId.toString().replace(/-/g, "");
                            if (/^0+$/.test(sClean)) bIsParent = true;
                        }

                        if (bIsParent) {
                            WorkSummaryDelegate._loadParentAggregation.call(that, sWbsId, oWSModel, oModel)
                                .then(resolve).catch(resolve);
                        } else {
                            WorkSummaryDelegate._loadLeafNodeAggregation.call(that, sWbsId, oWSModel, oModel)
                                .then(resolve).catch(resolve);
                        }
                    },
                    error: function () {
                        console.error("Failed to load WBS metadata for Work Summary:", sWbsId);
                        resolve();
                    }
                });
            });
        },

        _loadParentAggregation: function (sWbsId, oWSModel, oModel) {
            var that = this;
            var sNormParentId = sWbsId.toLowerCase().replace(/-/g, "");

            return new Promise(function(resolve, reject) {
                oModel.read("/WBSSet", {
                    filters: [new Filter("ParentId", FilterOperator.EQ, sWbsId)],
                    urlParameters: {
                        "$expand": "ToApprovalLog"
                    },
                    success: function (oData) {
                        if (that._sWorkSummaryToken !== sWbsId) { return resolve(); }

                        var aChildren = (oData.results || []).filter(function (w) {
                            if (!w.ParentId) return false;
                            return w.ParentId.toLowerCase().replace(/-/g, "") === sNormParentId;
                        });

                        if (aChildren.length === 0) {
                            oWSModel.setProperty("/Children", []);
                            return resolve();
                        }

                        var iProcessed = 0;
                        var fParentAggregate = 0;

                        aChildren.forEach(function (child) {
                            var sChildId = child.WbsId;
                            var sNormChildId = sChildId ? sChildId.toLowerCase().replace(/-/g, "") : "";

                            oModel.read("/DailyLogSet", {
                                filters: [new Filter("WbsId", FilterOperator.EQ, sChildId)],
                                success: function (oLogData) {
                                    if (that._sWorkSummaryToken !== sWbsId) return;

                                    var fSum = 0;
                                    (oLogData.results || []).forEach(function (l) {
                                        var sLogWbsId = l.WbsId ? l.WbsId.toLowerCase().replace(/-/g, "") : "";
                                        if (!sLogWbsId || sLogWbsId === sNormChildId) {
                                            fSum += parseFloat(l.QuantityDone) || 0;
                                        }
                                    });

                                    child.TotalQtyDone = Math.round(fSum).toString();
                                    child.WbsStatus = child.Status;
                                    child.ApprovalLog = child.ToApprovalLog;
                                    
                                    fParentAggregate += fSum;
                                    iProcessed++;

                                    if (iProcessed === aChildren.length) {
                                        oWSModel.setData({
                                            Children: aChildren,
                                            TotalQtyDone: Math.round(fParentAggregate).toString(),
                                            WbsId: sWbsId
                                        });
                                        resolve();
                                    }
                                },
                                error: function () {
                                    iProcessed++;
                                    if (iProcessed === aChildren.length) {
                                        oWSModel.setProperty("/Children", aChildren);
                                        resolve();
                                    }
                                }
                            });
                        });
                    },
                    error: function () {
                        oWSModel.setProperty("/Children", []);
                        resolve();
                    }
                });
            });
        },

        _loadLeafNodeAggregation: function (sWbsId, oWSModel, oModel) {
            var that = this;
            var sNormWbsId = sWbsId ? sWbsId.toLowerCase().replace(/-/g, "") : "";

            return new Promise(function(resolve, reject) {
                oModel.read("/DailyLogSet", {
                    filters: [new Filter("WbsId", FilterOperator.EQ, sWbsId)],
                    success: function (oData) {
                        if (that._sWorkSummaryToken !== sWbsId) { return resolve(); }
                        
                        var aLogs = oData.results || [];
                        var fTotal = 0;
                        var sUnit = "";
                        var dMinLog = null;
                        var dMaxLog = null;

                        aLogs.forEach(function (oLog) {
                            var sLogWbsId = oLog.WbsId ? oLog.WbsId.toLowerCase().replace(/-/g, "") : "";
                            if (!sLogWbsId || sLogWbsId === sNormWbsId) {
                                fTotal += parseFloat(oLog.QuantityDone) || 0;
                                if (oLog.UnitCode) sUnit = oLog.UnitCode;
                                
                                if (oLog.LogDate) {
                                    var d = (oLog.LogDate instanceof Date) ? oLog.LogDate : new Date(oLog.LogDate);
                                    if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
                                        if (!dMinLog || d < dMinLog) dMinLog = d;
                                        if (!dMaxLog || d > dMaxLog) dMaxLog = d;
                                    }
                                }
                            }
                        });

                        oWSModel.setData({
                            TotalQtyDone: Math.round(fTotal).toString(),
                            ActualStart: dMinLog,
                            ActualEnd: dMaxLog,
                            UnitCode: sUnit,
                            WbsId: sWbsId,
                            Children: []
                        });
                        resolve();
                    },
                    error: function () {
                        resolve();
                    }
                });
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

        formatCompletionRateTitle: function (sTarget, sUnit) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var fTarget = Math.round(parseFloat(sTarget) || 0);
            var sU = sUnit ? " " + sUnit : "";
            return oBundle.getText("completionRateTitle", [fTarget, sU]);
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
            return Math.round(fActual) + " / " + Math.round(fTarget) + sU;
        },

        formatTotalQty: function (sActual) {
            if (sActual === undefined || sActual === null || sActual === "") {
                return "0";
            }
            var fActual = parseFloat(sActual);
            if (isNaN(fActual)) return "0";
            // Return as integer string
            return Math.round(fActual).toString();
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

        /* =========================================================== */
        /* WBS STEPPER FORMATTERS                                       */
        /* =========================================================== */

        /**
         * Returns CSS class for stepper circles.
         * iStep: 1 (Planning), 2 (Pending Open), 3 (Opened), 4 (In Progress), 5 (Pending Close), 6 (Closed)
         */
        formatStepNumber: function (sStatus) {
            var m = {
                "PLANNING": 1,
                "PENDING_OPEN": 2,
                "OPEN_REJECTED": 2,
                "OPENED": 3,
                "IN_PROGRESS": 4,
                "PENDING_CLOSE": 5,
                "CLOSE_REJECTED": 5,
                "CLOSED": 6
            };
            return m[sStatus] || 0;
        },

        formatStepClass: function (sStatus, iStep) {
            var iCurrent = this.formatStepNumber(sStatus);
            if (iStep === 2 && sStatus === "OPEN_REJECTED") return "wbsStepCircle stepRejected";
            if (iStep === 5 && sStatus === "CLOSE_REJECTED") return "wbsStepCircle stepRejected";
            if (iCurrent > iStep) return "wbsStepCircle stepCompleted";
            if (iCurrent === iStep) return "wbsStepCircle stepActive";
            return "wbsStepCircle stepPending";
        },

        formatStepLabelClass: function (sStatus, iStep) {
            var iCurrent = this.formatStepNumber(sStatus);
            if (iStep === 3 && sStatus === "OPEN_REJECTED") return "labelRejected";
            if (iStep === 6 && sStatus === "CLOSE_REJECTED") return "labelRejected";
            if (iCurrent === iStep) return "labelActive";
            return "";
        },

        formatStepLineClass: function (sStatus, iStep) {
            var iCurrent = this.formatStepNumber(sStatus);
            if (iCurrent > iStep) return "lineCompleted";
            return "";
        },

        formatStepIcon: function (sStatus, iStep) {
            var iCurrent = this.formatStepNumber(sStatus);
            if (iStep === 2 && sStatus === "OPEN_REJECTED") return "sap-icon://decline";
            if (iStep === 5 && sStatus === "CLOSE_REJECTED") return "sap-icon://decline";

            // Success icon for completed steps
            if (iCurrent > iStep) return "sap-icon://accept";

            // Optional: return specific icons for each phase if not completed
            var aIcons = [
                "sap-icon://edit",          // Planning
                "sap-icon://paper-plane",   // Pending Open
                "sap-icon://it-host",       // Opened
                "sap-icon://customer",      // In Progress
                "sap-icon://pending",       // Pending Close
                "sap-icon://accept"         // Closed
            ];

            return aIcons[iStep - 1] || null;
        },

        formatStepLabel: function (iStep, sStatus) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // UI5 parts might pass objects or strings, ensure iStep is numeric
            var iStepNum = parseInt(iStep);
            var aLabels = [
                oBundle.getText("planningStepLabel"),
                oBundle.getText("pendingOpenStepLabel"),
                oBundle.getText("openedStepLabel"),
                oBundle.getText("inProgressStepLabel"),
                oBundle.getText("pendingCloseStepLabel"),
                oBundle.getText("closedStepLabel")
            ];
            var sLabel = aLabels[iStepNum - 1];

            if (iStepNum === 3 && sStatus === "OPEN_REJECTED") return oBundle.getText("openRejectedStatus") || "Open Rejected";
            if (iStepNum === 6 && sStatus === "CLOSE_REJECTED") return oBundle.getText("closeRejectedStatus") || "Close Rejected";

            return sLabel || "";
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

            var oBundle = oView.getModel("i18n").getResourceBundle();

            var fnCallAction = function () {
                var oModel = this.getOwnerComponent().getModel();
                var oWbsCtx = this.getView().getBindingContext();
                var sStatus = oWbsCtx ? oWbsCtx.getProperty("Status") : "";

                // Strict status guard for Closing flow
                if (sStatus !== "IN_PROGRESS" && sStatus !== "CLOSE_REJECTED") {
                    sap.m.MessageBox.error(oBundle.getText("submitCloseStatusError"));
                    return;
                }

                oView.setBusy(true);

                // --- OLD API CODE (COMMENTED) ---
                /*
                // Official API for Closing flow
                oModel.callFunction("/CloseWbsApproval", {
                    method: "POST",
                    urlParameters: {
                        WBS_IDS: sWbsId
                    },
                    success: function (oData, response) {
                        oView.setBusy(false);
                        if (oData && oData.SUCCESS === false) {
                            sap.m.MessageBox.error(oData.MESSAGE || oBundle.getText("submitForApprovalError"));
                            return;
                        }

                        sap.m.MessageBox.success(oData.MESSAGE || oBundle.getText("submitForApprovalSuccess"), {
                            onClose: function () {
                                if (typeof this.onCloseAcceptanceDialog === "function") {
                                    this.onCloseAcceptanceDialog();
                                }
                            }.bind(this)
                        });
                        this._loadWorkSummary(sWbsId);
                        // Cascade status recomputation handled by DB
                        var oBinding = oView.getElementBinding();
                        if (oBinding) { oBinding.refresh(); }
                    }.bind(this),
                    error: function (oError) {
                        oView.setBusy(false);
                        var sMsg = oBundle.getText("submitForApprovalError");
                        try {
                            var oErr = JSON.parse(oError.responseText);
                            sMsg = oErr.error.message.value || sMsg;
                        } catch (e) { }
                        sap.m.MessageBox.error(sMsg);
                    }
                });
                */
                // --- END OLD API CODE ---

                // --- NEW API CODE ---
                oModel.callFunction("/ApproveWbs", {
                    method: "POST",
                    urlParameters: { WbsIds: sWbsId, ApprovalType: "CLOSE" },
                    success: function (oData) {
                        oView.setBusy(false);
                        this._loadWorkSummary(sWbsId);
                        var oBinding = oView.getElementBinding();
                        if (oBinding) { oBinding.refresh(); }

                        var aResults = oData.results || (oData.ApproveWbs && oData.ApproveWbs.results) || [];
                        if (aResults && aResults.length > 0) {
                            var oFirstResult = aResults[0];
                            if (oFirstResult.ReturnType === "E") {
                                sap.m.MessageBox.error(oFirstResult.Message || oBundle.getText("submitForApprovalError"));
                            } else if (oFirstResult.ReturnType === "W") {
                                sap.m.MessageBox.warning(oFirstResult.Message || oBundle.getText("submitForApprovalError"));
                            } else {
                                sap.m.MessageBox.success(oFirstResult.Message || oBundle.getText("submitForApprovalSuccess"), {
                                    onClose: function () {
                                        if (typeof this.onCloseAcceptanceDialog === "function") {
                                            this.onCloseAcceptanceDialog();
                                        }
                                    }.bind(this)
                                });
                            }
                        } else {
                            sap.m.MessageBox.success(oBundle.getText("submitForApprovalSuccess"), {
                                onClose: function () {
                                    if (typeof this.onCloseAcceptanceDialog === "function") {
                                        this.onCloseAcceptanceDialog();
                                    }
                                }.bind(this)
                            });
                        }
                    }.bind(this),
                    error: function (oError) {
                        oView.setBusy(false);
                        var sMsg = oBundle.getText("submitForApprovalError");
                        try {
                            if (oError && oError.responseText) {
                                var oErr = JSON.parse(oError.responseText);
                                if (oErr.error && oErr.error.message && oErr.error.message.value) {
                                    sMsg = oErr.error.message.value;
                                } else if (oErr.error && oErr.error.innererror && oErr.error.innererror.errordetails && oErr.error.innererror.errordetails.length > 0) {
                                    sMsg = oErr.error.innererror.errordetails[0].message;
                                }
                            }
                        } catch (e) { }
                        sap.m.MessageBox.error(sMsg);
                    }
                });
                // --- END NEW API CODE ---
            }.bind(this);

            var fnRunWithDependencyCheck = function () {
                if (typeof this.validateDependencyOnClose === "function") {
                    this.validateDependencyOnClose(sWbsId).then(fnCallAction).catch(function (sMsg) {
                        var oBundle2 = oView.getModel("i18n").getResourceBundle();
                        sap.m.MessageBox.error(sMsg, { title: oBundle2.getText("depDependencyViolationTitle") || "Dependency Constraint" });
                    });
                } else {
                    fnCallAction();
                }
            }.bind(this);

            if (fTotalDone < fTargetQty) {
                sap.m.MessageBox.confirm(
                    oBundle.getText("submitCloseConfirmQty"),
                    {
                        title: oBundle.getText("confirmSubmission"),
                        onClose: function (sAction) {
                            if (sAction === sap.m.MessageBox.Action.OK) {
                                fnRunWithDependencyCheck();
                            }
                        }
                    }
                );
            } else {
                fnRunWithDependencyCheck();
            }
        }
    };

    return WorkSummaryDelegate;
});
