sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
    "use strict";

    var WorkSummaryDelegate = {
        init: function (oController) {
            oController._loadWorkSummary = this._loadWorkSummary.bind(oController);
            oController.formatQtyPercentageStr = this.formatQtyPercentageStr.bind(oController);
            oController.formatQtyProgressPercent = this.formatQtyProgressPercent.bind(oController);
            oController.formatQtyProgressState = this.formatQtyProgressState.bind(oController);
            oController.formatQtyProgressDisplay = this.formatQtyProgressDisplay.bind(oController);
            oController.formatTimeElapsedDisplay = this.formatTimeElapsedDisplay.bind(oController);
            oController.formatTimeElapsedPercent = this.formatTimeElapsedPercent.bind(oController);
            oController.formatTimeElapsedPercentStr = this.formatTimeElapsedPercentStr.bind(oController);
            oController.formatTimeElapsedState = this.formatTimeElapsedState.bind(oController);
            oController.formatTotalQty = this.formatTotalQty.bind(oController);
            oController.formatWorkSummaryStatusState = this.formatWorkSummaryStatusState.bind(oController);
            oController.formatWorkSummaryStatusIcon = this.formatWorkSummaryStatusIcon.bind(oController);
            oController.onSubmitForApproval = this.onSubmitForApproval.bind(oController);

            oController.formatQuantityState = this.formatQuantityState.bind(oController);
            oController.formatPercentage = this.formatPercentage.bind(oController);
            oController.formatProgress = this.formatProgress.bind(oController);

            // New Date Formatters
            oController.formatPlanDateRange = this.formatPlanDateRange.bind(oController);
            oController.formatPlanDuration = this.formatPlanDuration.bind(oController);
            oController.formatActualDateRange = this.formatActualDateRange.bind(oController);
            oController.formatActualDuration = this.formatActualDuration.bind(oController);
            oController.formatActualDurationState = this.formatActualDurationState.bind(oController);

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

            // 1. Reset model only if navigating to a DIFFERENT WBS to clear stale data.
            // If it's a refresh of the same WBS, keep the current data to avoid UI flicker (resetting to 0%).
            if (oWSModel.getProperty("/WbsId") !== sWbsId) {
                oWSModel.setData({
                    TotalQtyDone: "0",
                    Children: [],
                    DailyLogs: [],
                    WbsId: sWbsId
                });
            }

            // Race-condition guard: stamp the current request token.
            // Callbacks will abort if this token has changed (i.e. user navigated away).
            this._sWorkSummaryToken = sWbsId;

            // 2. Fetch the WBS record to get the ABSOLUTE LATEST ParentId for this ID
            oModel.read("/WBSSet(guid'" + sWbsId + "')", {
                success: function (oWbs) {
                    // Abort if user already navigated to another WBS
                    if (that._sWorkSummaryToken !== sWbsId) { return; }

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
                        WorkSummaryDelegate._loadParentAggregation.call(that, sWbsId, oWSModel, oModel, oWbs);
                    } else {
                        // 4. Leaf Node Branch: Aggregate logs for THIS WBS
                        WorkSummaryDelegate._loadLeafNodeAggregation.call(that, sWbsId, oWSModel, oModel, oWbs);
                    }
                },
                error: function () {
                    console.error("Failed to load WBS metadata for Work Summary:", sWbsId);
                }
            });
        },

        _loadParentAggregation: function (sWbsId, oWSModel, oModel, oWbs) {
            var that = this;
            oModel.read("/WBSSet", {
                filters: sWbsId ? [new Filter("ParentId", FilterOperator.EQ, sWbsId)] : [],
                urlParameters: {
                    "$expand": "ToApprovalLog"
                },
                success: function (oData) {
                    // Race-condition guard
                    if (that._sWorkSummaryToken !== sWbsId) { return; }

                    var sNormParentId = sWbsId.toLowerCase().replace(/-/g, "");
                    var aChildren = (oData.results || []).filter(function (w) {
                        if (!w.ParentId) return false;
                        return w.ParentId.toLowerCase().replace(/-/g, "") === sNormParentId;
                    });

                    if (aChildren.length === 0) {
                        oWSModel.setProperty("/Children", []);
                        var dServerDateObjZero = that.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
                        WorkSummaryDelegate._buildLogHistoryMatrix(oWbs, [], oWSModel, dServerDateObjZero);
                        return;
                    }

                    var iProcessed = 0;
                    aChildren.forEach(function (oChild) {
                        var sChildId = oChild.WbsId;
                        var sNormChildId = sChildId ? sChildId.toLowerCase().replace(/-/g, "") : "";

                        oModel.read("/DailyLogSet", {
                            filters: sChildId ? [new Filter("WbsId", FilterOperator.EQ, sChildId)] : [],
                            success: function (oLogData) {
                                // Race-condition guard
                                if (that._sWorkSummaryToken !== sWbsId) { return; }

                                var fSum = 0;
                                var aLogs = [];
                                // Client-side filter: backend có thể ignore $filter và trả về tất cả logs
                                (oLogData.results || []).forEach(function (l) {
                                    var sLogWbsId = l.WbsId ? l.WbsId.toLowerCase().replace(/-/g, "") : "";
                                    if (!sLogWbsId || sLogWbsId === sNormChildId) {
                                        fSum += parseFloat(l.QuantityDone) || 0;
                                        aLogs.push(l);
                                    }
                                });
                                oChild.TotalQtyDone = Math.round(fSum).toString();
                                oChild.DailyLogs = aLogs;

                                iProcessed++;
                                if (iProcessed === aChildren.length) {
                                    var fParentAggregate = 0;
                                    var aAllLogs = [];
                                    aChildren.forEach(function (c) {
                                        fParentAggregate += parseFloat(c.TotalQtyDone) || 0;
                                        if (c.DailyLogs) {
                                            aAllLogs = aAllLogs.concat(c.DailyLogs);
                                        }
                                    });

                                    oWSModel.setProperty("/Children", aChildren);
                                    oWSModel.setProperty("/TotalQtyDone", Math.round(fParentAggregate).toString());
                                    oWSModel.setProperty("/DailyLogs", aAllLogs);

                                    WorkSummaryDelegate._calculateWeatherAndRiskStats(aAllLogs, oWSModel);
                                    WorkSummaryDelegate._loadResourceForecasting.call(that, aAllLogs, oWSModel, fParentAggregate, parseFloat(oWbs.Quantity) || 0);

                                    var dServerDateObj = that.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
                                    WorkSummaryDelegate._buildLogHistoryMatrix(oWbs, aAllLogs, oWSModel, dServerDateObj);
                                }
                            },
                            error: function () {
                                if (that._sWorkSummaryToken !== sWbsId) { return; }
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

        _loadLeafNodeAggregation: function (sWbsId, oWSModel, oModel, oWbs) {
            var that = this;
            var sNormWbsId = sWbsId ? sWbsId.toLowerCase().replace(/-/g, "") : "";

            oModel.read("/DailyLogSet", {
                filters: sWbsId ? [new Filter("WbsId", FilterOperator.EQ, sWbsId)] : [],
                success: function (oData) {
                    // Race-condition guard: nếu user đã navigate sang WBS khác thì bỏ qua
                    if (that._sWorkSummaryToken !== sWbsId) { return; }

                    var fTotal = 0;
                    var dMinLog = null;
                    var dMaxLog = null;
                    var aLogs = [];
                    // Client-side filter: backend có thể ignore $filter và trả về tất cả logs
                    // Nếu WbsId trên log không khớp thì bỏ qua (tránh hiện data của WBS khác)
                    (oData.results || []).forEach(function (oLog) {
                        var sLogWbsId = oLog.WbsId ? oLog.WbsId.toLowerCase().replace(/-/g, "") : "";
                        if (!sLogWbsId || sLogWbsId === sNormWbsId) {
                            fTotal += parseFloat(oLog.QuantityDone) || 0;
                            aLogs.push(oLog);
                            if (oLog.LogDate) {
                                var d = (oLog.LogDate instanceof Date) ? oLog.LogDate : new Date(oLog.LogDate);
                                if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
                                    if (!dMinLog || d < dMinLog) dMinLog = d;
                                    if (!dMaxLog || d > dMaxLog) dMaxLog = d;
                                }
                            }
                        }
                    });

                    oWSModel.setProperty("/TotalQtyDone", Math.round(fTotal).toString());
                    oWSModel.setProperty("/ActualStart", dMinLog);
                    oWSModel.setProperty("/ActualEnd", dMaxLog);
                    oWSModel.setProperty("/DailyLogs", aLogs);

                    WorkSummaryDelegate._calculateWeatherAndRiskStats(aLogs, oWSModel);
                    WorkSummaryDelegate._loadResourceForecasting.call(that, aLogs, oWSModel, fTotal, parseFloat(oWbs.Quantity) || 0);

                    var dServerDateObj = that.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
                    WorkSummaryDelegate._buildLogHistoryMatrix(oWbs, aLogs, oWSModel, dServerDateObj);
                    WorkSummaryDelegate._buildFullLogHistory(oWbs, aLogs, oWSModel, dServerDateObj);

                    if (typeof that._bindApprovalLogList === "function") {
                        that._bindApprovalLogList(sWbsId);
                    }
                },
                error: function () {
                    console.error("Failed to aggregate logs for leaf WBS:", sWbsId);
                }
            });
        },

        _calculateWeatherAndRiskStats: function (aLogs, oWSModel) {
            var mDays = {};
            var iTotalDaysWithLog = 0;
            var weatherPriority = { "CLOUDY": 1, "SUNNY": 2, "RAINY": 3, "STORMY": 4 };

            if (!aLogs || aLogs.length === 0) {
                oWSModel.setProperty("/WeatherStats", {
                    CloudyText: "0/0 ngày (0%)",
                    SunnyText: "0/0 ngày (0%)",
                    RainyText: "0/0 ngày (0%)",
                    StormyText: "0/0 ngày (0%)"
                });
                oWSModel.setProperty("/RiskStats", {
                    SafeText: "An toàn lao động: 0 / 0 ngày (0%)",
                    ContractorText: "Vận hành/Nhà thầu: 0 / 0 ngày (0%)",
                    OverallLevel: "Rủi ro: Thấp",
                    OverallState: "Success"
                });
                return;
            }

            aLogs.forEach(function (l) {
                if (!l.LogDate) return;
                var dLog = new Date(l.LogDate);
                dLog.setHours(0, 0, 0, 0);
                var t = dLog.getTime();

                if (!mDays[t]) {
                    mDays[t] = { weatherStr: "", weatherRank: 0, hasSafe: false, hasContractor: false };
                    iTotalDaysWithLog++;
                }

                [l.WeatherAm, l.WeatherPm].forEach(function (w) {
                    if (w && weatherPriority[w]) {
                        if (weatherPriority[w] > mDays[t].weatherRank) {
                            mDays[t].weatherRank = weatherPriority[w];
                            mDays[t].weatherStr = w;
                        }
                    }
                });

                if (l.SafeNote && typeof l.SafeNote === "string" && l.SafeNote.trim() !== "") mDays[t].hasSafe = true;
                if (l.ContractorNote && typeof l.ContractorNote === "string" && l.ContractorNote.trim() !== "") mDays[t].hasContractor = true;
            });

            var iCloudy = 0, iSunny = 0, iRainy = 0, iStormy = 0;
            var iSafe = 0, iContractor = 0;

            Object.keys(mDays).forEach(function (k) {
                var oDay = mDays[k];
                if (oDay.weatherStr === "CLOUDY") iCloudy++;
                if (oDay.weatherStr === "SUNNY") iSunny++;
                if (oDay.weatherStr === "RAINY") iRainy++;
                if (oDay.weatherStr === "STORMY") iStormy++;

                if (oDay.hasSafe) iSafe++;
                if (oDay.hasContractor) iContractor++;
            });

            var fnFormat = function (iCount) {
                if (iTotalDaysWithLog === 0) return "0/0 ngày (0%)";
                var pct = Math.round((iCount / iTotalDaysWithLog) * 100);
                return iCount + "/" + iTotalDaysWithLog + " ngày (" + pct + "%)";
            };

            oWSModel.setProperty("/WeatherStats", {
                CloudyText: fnFormat(iCloudy),
                SunnyText: fnFormat(iSunny),
                RainyText: fnFormat(iRainy),
                StormyText: fnFormat(iStormy)
            });

            var getSafeRiskState = function (pct) {
                if (pct > 10) return { level: "Cao", state: "Error", icon: "sap-icon://message-error" };
                if (pct > 2) return { level: "Trung bình", state: "Warning", icon: "sap-icon://message-warning" };
                return { level: "Thấp", state: "Success", icon: "sap-icon://sys-enter-2" };
            };

            var getContractorRiskState = function (pct) {
                if (pct > 20) return { level: "Cao", state: "Error", icon: "sap-icon://message-error" };
                if (pct > 10) return { level: "Trung bình", state: "Warning", icon: "sap-icon://message-warning" };
                return { level: "Thấp", state: "Success", icon: "sap-icon://sys-enter-2" };
            };

            var fSafePct = iTotalDaysWithLog > 0 ? (iSafe / iTotalDaysWithLog) * 100 : 0;
            var oSafeRisk = getSafeRiskState(fSafePct);

            var fContractorPct = iTotalDaysWithLog > 0 ? (iContractor / iTotalDaysWithLog) * 100 : 0;
            var oContractorRisk = getContractorRiskState(fContractorPct);

            oWSModel.setProperty("/RiskStats", {
                SafeText: "An toàn lao động: " + fnFormat(iSafe),
                SafeLevel: "Rủi ro: " + oSafeRisk.level,
                SafeState: oSafeRisk.state,
                SafeIcon: oSafeRisk.icon,

                ContractorText: "Vận hành thi công: " + fnFormat(iContractor),
                ContractorLevel: "Rủi ro: " + oContractorRisk.level,
                ContractorState: oContractorRisk.state,
                ContractorIcon: oContractorRisk.icon
            });
        },

        _loadResourceForecasting: function(aLogs, oWSModel, fTotalQtyDone, fQuantity) {
            var oModel = this.getOwnerComponent().getModel();
            if (!aLogs || aLogs.length === 0) {
                oWSModel.setProperty("/ResourceForecasting", []);
                return;
            }

            var aLogIds = [];
            aLogs.forEach(function(l) {
                if (l.LogId && aLogIds.indexOf(l.LogId) === -1) {
                    aLogIds.push(l.LogId);
                }
            });

            if (aLogIds.length === 0) {
                oWSModel.setProperty("/ResourceForecasting", []);
                return;
            }

            oModel.read("/ResourceSet", {
                success: function (oResMaster) {
                    var mResMaster = {};
                    (oResMaster.results || []).forEach(function(r) {
                        mResMaster[r.ResourceId] = r;
                    });

                    var aAllResourceUses = [];
                    var iBatchSize = 20;
                    var iBatches = Math.ceil(aLogIds.length / iBatchSize);
                    var iDone = 0;

                    var fnProcessResults = function() {
                        var mGrouped = {};
                        aAllResourceUses.forEach(function(u) {
                            var sResId = (u.ResourceId || "").trim().toUpperCase();
                            if (!sResId) return;

                            var flQty = parseFloat(u.Quantity) || 0;
                            if (mGrouped[sResId]) {
                                mGrouped[sResId].UsedQuantity += flQty;
                            } else {
                                var oMaster = mResMaster[sResId] || mResMaster[u.ResourceId] || {};
                                mGrouped[sResId] = {
                                    ResourceId: sResId,
                                    ResourceName: oMaster.ResourceName || u.ResourceId,
                                    ResourceType: oMaster.ResourceType || "",
                                    UnitCode: oMaster.UnitCode || "",
                                    UsedQuantity: flQty
                                };
                            }
                        });

                        var aForecasting = [];
                        var fRemainingQty = Math.max(0, fQuantity - fTotalQtyDone);
                        var sRemainingText = "Còn: " + Math.round(fRemainingQty);
                        oWSModel.setProperty("/RemainingQtyText", sRemainingText);

                        var oNumFormat = sap.ui.core.format.NumberFormat.getFloatInstance({ maxFractionDigits: 2, groupingEnabled: true });
                        var oNormFormat = sap.ui.core.format.NumberFormat.getFloatInstance({ maxFractionDigits: 4, groupingEnabled: true });

                        Object.keys(mGrouped).forEach(function(k) {
                            var oItem = mGrouped[k];
                            oItem.UsedQuantityFormatted = oNumFormat.format(oItem.UsedQuantity);
                            
                            oItem.Norm = fTotalQtyDone > 0 ? (oItem.UsedQuantity / fTotalQtyDone) : 0;
                            oItem.NormText = oNormFormat.format(oItem.Norm) + " / Khối lượng";
                            
                            var fEtc = oItem.Norm * fRemainingQty;
                            oItem.EtcQuantityRaw = fEtc;
                            oItem.EtcQuantity = oNumFormat.format(Math.ceil(fEtc)); // Làm tròn lên
                            oItem.EtcState = fEtc > 0 ? "Warning" : "None";
                            
                            aForecasting.push(oItem);
                        });

                        aForecasting.sort(function(a, b) {
                            if (a.ResourceType !== b.ResourceType) return a.ResourceType.localeCompare(b.ResourceType);
                            return a.ResourceName.localeCompare(b.ResourceName);
                        });

                        oWSModel.setProperty("/ResourceForecasting", aForecasting);
                    };

                    for (var i = 0; i < iBatches; i++) {
                        var aBatchIds = aLogIds.slice(i * iBatchSize, (i + 1) * iBatchSize);
                        var aFilters = aBatchIds.map(function(id) {
                            return new sap.ui.model.Filter("LogId", sap.ui.model.FilterOperator.EQ, id);
                        });
                        var oFilter = new sap.ui.model.Filter({ filters: aFilters, and: false });

                        oModel.read("/ResourceUseSet", {
                            filters: [oFilter],
                            success: function(oData) {
                                aAllResourceUses = aAllResourceUses.concat(oData.results || []);
                                iDone++;
                                if (iDone === iBatches) fnProcessResults();
                            },
                            error: function() {
                                iDone++;
                                if (iDone === iBatches) fnProcessResults();
                            }
                        });
                    }
                },
                error: function() {
                    oWSModel.setProperty("/ResourceForecasting", []);
                }
            });
        },

        _buildLogHistoryMatrix: function (oWbs, aLogs, oWSModel, dServerDateObj) {
            var aDates = [], aLogIcons = [], aLogColors = [], aLogTexts = [];
            var aQtys = [], aWeathers = [], aNoteIcons = [], aNoteColors = [], aNoteTexts = [];

            for (var i = 0; i < 14; i++) {
                aDates.push("-");
                aLogIcons.push(""); aLogColors.push("Default"); aLogTexts.push("-");
                aQtys.push("-");
                aWeathers.push("-");
                aNoteIcons.push(""); aNoteColors.push("Default"); aNoteTexts.push("-");
            }

            var fnSetProps = function () {
                oWSModel.setProperty("/HistoryDates", aDates);
                oWSModel.setProperty("/HistoryLogIcons", aLogIcons);
                oWSModel.setProperty("/HistoryLogColors", aLogColors);
                oWSModel.setProperty("/HistoryLogTexts", aLogTexts);
                oWSModel.setProperty("/HistoryQtys", aQtys);
                oWSModel.setProperty("/HistoryWeathers", aWeathers);
                oWSModel.setProperty("/HistoryNoteIcons", aNoteIcons);
                oWSModel.setProperty("/HistoryNoteColors", aNoteColors);
                oWSModel.setProperty("/HistoryNoteTexts", aNoteTexts);
            };

            if (!oWbs) { fnSetProps(); return; }

            var sStatus = oWbs.Status;
            if (["PLANNING", "PENDING_OPEN", "OPEN_REJECTED", "OPENED"].indexOf(sStatus) !== -1) {
                fnSetProps(); return;
            }

            var dStartActual = (oWbs.StartActual instanceof Date) ? oWbs.StartActual : (oWbs.StartActual ? new Date(oWbs.StartActual) : null);
            var dEndActual = (oWbs.EndActual instanceof Date) ? oWbs.EndActual : (oWbs.EndActual ? new Date(oWbs.EndActual) : null);

            var dEnd = null, dStart = null;
            var bIsClosed = (sStatus === "CLOSED");
            dEnd = bIsClosed ? dEndActual : dServerDateObj;

            if (!dEnd || !dStartActual) { fnSetProps(); return; }

            var dEnd_clone = new Date(dEnd.getTime()); dEnd_clone.setHours(0, 0, 0, 0);
            var dStartActual_clone = new Date(dStartActual.getTime()); dStartActual_clone.setHours(0, 0, 0, 0);

            var dSystemMinus13 = new Date(dEnd_clone.getTime() - 13 * 24 * 60 * 60 * 1000);
            dStart = (dStartActual_clone > dSystemMinus13) ? dStartActual_clone : dSystemMinus13;

            var aCalculatedDates = [];
            var dCurrent = new Date(dStart.getTime());
            while (dCurrent <= dEnd_clone) {
                aCalculatedDates.push(new Date(dCurrent.getTime()));
                dCurrent.setDate(dCurrent.getDate() + 1);
            }

            var fnGetLogsForDate = function (dTarget) {
                return aLogs.filter(function (l) {
                    if (!l.LogDate) return false;
                    var dLog = (l.LogDate instanceof Date) ? l.LogDate : new Date(l.LogDate);
                    return dLog.getFullYear() === dTarget.getFullYear() &&
                        dLog.getMonth() === dTarget.getMonth() &&
                        dLog.getDate() === dTarget.getDate();
                });
            };

            var mWeatherMap = {
                "CLOUDY": { rank: 1, icon: "☁️" },
                "SUNNY": { rank: 2, icon: "☀️" },
                "RAINY": { rank: 3, icon: "🌧️" },
                "STORMY": { rank: 4, icon: "⛈️" }
            };

            for (var j = 0; j < aCalculatedDates.length && j < 14; j++) {
                var dDate = aCalculatedDates[j];
                var sDateText = ("0" + dDate.getDate()).slice(-2) + "/" + ("0" + (dDate.getMonth() + 1)).slice(-2);
                if (!bIsClosed && j === aCalculatedDates.length - 1) { sDateText = "H.Nay"; }
                aDates[j] = sDateText;

                var aDayLogs = fnGetLogsForDate(dDate);
                if (aDayLogs.length > 0) {
                    aLogIcons[j] = "sap-icon://sys-enter-2";
                    aLogColors[j] = "Positive";
                    aLogTexts[j] = "";

                    var fDayQty = parseFloat(aDayLogs[0].QuantityDone) || 0;
                    aQtys[j] = Math.round(fDayQty).toString();

                    var bHasSafe = false, bHasContractor = false;
                    var iHighestWeatherRank = 0;
                    var sHighestWeatherIcon = "";

                    aDayLogs.forEach(function (l) {
                        if (l.SafeNote) bHasSafe = true;
                        if (l.ContractorNote) bHasContractor = true;

                        [l.WeatherAm, l.WeatherPm].forEach(function (w) {
                            if (w && mWeatherMap[w]) {
                                if (mWeatherMap[w].rank > iHighestWeatherRank) {
                                    iHighestWeatherRank = mWeatherMap[w].rank;
                                    sHighestWeatherIcon = mWeatherMap[w].icon;
                                }
                            }
                        });
                    });

                    if (sHighestWeatherIcon) {
                        aWeathers[j] = sHighestWeatherIcon;
                    }

                    if (bHasSafe && bHasContractor) {
                        aNoteIcons[j] = "sap-icon://documents";
                        aNoteColors[j] = "Critical";
                        aNoteTexts[j] = "";
                    } else if (bHasSafe || bHasContractor) {
                        aNoteIcons[j] = "sap-icon://notes";
                        aNoteColors[j] = "Critical";
                        aNoteTexts[j] = "";
                    }
                } else {
                    aLogIcons[j] = "sap-icon://error";
                    aLogColors[j] = "Negative";
                    aLogTexts[j] = "";
                }
            }

            fnSetProps();
        },

        _buildFullLogHistory: function (oWbs, aLogs, oWSModel, dServerDateObj) {
            var aFullHistory = [];
            var fTotalQty = 0;

            if (!oWbs) {
                oWSModel.setProperty("/FullLogHistory", aFullHistory);
                oWSModel.setProperty("/FullLogHistoryTotalQty", "0");
                oWSModel.setProperty("/FullLogHistoryUnitCode", "");
                return;
            }

            var sUnitCode = oWbs.UnitCode || (aLogs && aLogs.length > 0 ? aLogs[0].UnitCode : "");

            var sStatus = oWbs.Status;
            // Not showing history for these statuses
            if (["PLANNING", "PENDING_OPEN", "OPEN_REJECTED", "OPENED"].indexOf(sStatus) !== -1) {
                oWSModel.setProperty("/FullLogHistory", aFullHistory);
                oWSModel.setProperty("/FullLogHistoryTotalQty", "0");
                oWSModel.setProperty("/FullLogHistoryUnitCode", sUnitCode);
                return;
            }

            // Determine start date
            var dStart = oWbs.ActualStart || oWSModel.getProperty("/ActualStart");
            if (!dStart) {
                oWSModel.setProperty("/FullLogHistory", aFullHistory);
                oWSModel.setProperty("/FullLogHistoryTotalQty", "0");
                oWSModel.setProperty("/FullLogHistoryUnitCode", sUnitCode);
                return;
            }

            // Determine end date
            var dEnd = dServerDateObj;
            if (sStatus === "CLOSED") {
                dEnd = oWbs.ActualEnd || oWSModel.getProperty("/ActualEnd") || dEnd;
            }

            // Standardize to midnight for loop
            dStart = new Date(dStart);
            dStart.setHours(0, 0, 0, 0);
            dEnd = new Date(dEnd);
            dEnd.setHours(0, 0, 0, 0);

            // Generate range
            var aDateRange = [];
            var dCurrent = new Date(dStart);
            while (dCurrent <= dEnd) {
                aDateRange.push(new Date(dCurrent));
                dCurrent.setDate(dCurrent.getDate() + 1);
            }

            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
            var weatherPriority = { "CLOUDY": 1, "SUNNY": 2, "RAINY": 3, "STORMY": 4 };
            var weatherIcons = { "CLOUDY": "☁️", "SUNNY": "☀️", "RAINY": "🌧️", "STORMY": "⛈️" };
            var weatherTooltips = { "CLOUDY": "Nhiều mây", "SUNNY": "Nắng", "RAINY": "Mưa", "STORMY": "Bão" };

            // Process each day in reverse (newest first)
            for (var i = aDateRange.length - 1; i >= 0; i--) {
                var dDate = aDateRange[i];
                var sDateFormatted = oDateFormat.format(dDate);

                var oDayData = {
                    DateFormatted: sDateFormatted,
                    Qty: "-",
                    UnitCode: sUnitCode,
                    WeatherAmIcon: "-",
                    WeatherAmTooltip: "",
                    WeatherPmIcon: "-",
                    WeatherPmTooltip: "",
                    SafeNoteIcon: "",
                    ContractorNoteIcon: ""
                };

                // Filter logs for this day
                var aDayLogs = [];
                if (aLogs && aLogs.length > 0) {
                    aDayLogs = aLogs.filter(function (l) {
                        if (!l.LogDate) return false;
                        var dLog = new Date(l.LogDate);
                        dLog.setHours(0, 0, 0, 0);
                        return dLog.getTime() === dDate.getTime();
                    });
                }

                if (aDayLogs.length > 0) {
                    var sHighestAm = null;
                    var sHighestPm = null;
                    var bHasSafe = false;
                    var bHasContractor = false;

                    // Parse the quantity from the first log found
                    var fDayQty = parseFloat(aDayLogs[0].QuantityDone) || 0;
                    oDayData.Qty = fDayQty.toString();
                    fTotalQty += fDayQty;

                    aDayLogs.forEach(function (l) {
                        if (l.SafeNote && l.SafeNote.trim() !== "") bHasSafe = true;
                        if (l.ContractorNote && l.ContractorNote.trim() !== "") bHasContractor = true;

                        if (l.WeatherAm && weatherPriority[l.WeatherAm]) {
                            if (!sHighestAm || weatherPriority[l.WeatherAm] > weatherPriority[sHighestAm]) {
                                sHighestAm = l.WeatherAm;
                            }
                        }
                        if (l.WeatherPm && weatherPriority[l.WeatherPm]) {
                            if (!sHighestPm || weatherPriority[l.WeatherPm] > weatherPriority[sHighestPm]) {
                                sHighestPm = l.WeatherPm;
                            }
                        }
                    });

                    if (sHighestAm) {
                        oDayData.WeatherAmIcon = weatherIcons[sHighestAm];
                        oDayData.WeatherAmTooltip = weatherTooltips[sHighestAm];
                    }
                    if (sHighestPm) {
                        oDayData.WeatherPmIcon = weatherIcons[sHighestPm];
                        oDayData.WeatherPmTooltip = weatherTooltips[sHighestPm];
                    }

                    if (bHasSafe) {
                        oDayData.SafeNoteIcon = "sap-icon://notes";
                    }
                    if (bHasContractor) {
                        oDayData.ContractorNoteIcon = "sap-icon://notes";
                    }
                }

                aFullHistory.push(oDayData);
            }

            oWSModel.setProperty("/FullLogHistory", aFullHistory);
            oWSModel.setProperty("/FullLogHistoryTotalQty", Math.round(fTotalQty).toString());
            oWSModel.setProperty("/FullLogHistoryUnitCode", sUnitCode);
        },



        /* =========================================================== */
        /* UI Event Handlers for Work Summary                          */
        /* =========================================================== */

        onPressViewFullLogHistory: function (oEvent) {
            var oView = this.getView();
            if (!this._oFullLogHistoryDialog) {
                this._oFullLogHistoryDialog = sap.ui.xmlfragment(oView.getId(), "z.bts.buildtrack551.view.fragments.FullLogHistoryDialog", this);
                oView.addDependent(this._oFullLogHistoryDialog);
            }
            this._oFullLogHistoryDialog.open();
        },

        onSearchFullLogHistory: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            var aFilters = [];

            if (sQuery && sQuery.length > 0) {
                var oFilterDate = new sap.ui.model.Filter("DateFormatted", sap.ui.model.FilterOperator.Contains, sQuery);
                var oFilterQty = new sap.ui.model.Filter("Qty", sap.ui.model.FilterOperator.Contains, sQuery);
                aFilters.push(new sap.ui.model.Filter([oFilterDate, oFilterQty], false));
            }

            var oTable = this.getView().byId("idFullLogHistoryTable");
            if (oTable) {
                var oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.filter(aFilters);
                }
            }
        },

        onCloseFullLogHistory: function () {
            if (this._oFullLogHistoryDialog) {
                this._oFullLogHistoryDialog.close();
            }
        },

        /* =========================================================== */
        /* Formatter Methods for Work Summary                          */
        /* =========================================================== */

        formatQtyPercentageStr: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "0%";
            var fActual = parseFloat(this.getView().getModel("workSummaryModel").getProperty("/TotalQtyDone")) || 0;
            var fTarget = parseFloat(oCtx.getProperty("Quantity")) || 0;
            if (fTarget === 0) return "0%";
            var fPercent = (fActual / fTarget) * 100;
            return parseFloat(fPercent.toFixed(2)) + "%";
        },

        formatQuantityState: function (sTotalQtyDone, sQuantity) {
            var fTotal = parseFloat(sTotalQtyDone) || 0;
            var fQty = parseFloat(sQuantity) || 0;
            if (fQty === 0) return "Warning";
            return fTotal >= fQty ? "Success" : "Warning";
        },

        formatPercentage: function (sTotalQtyDone, sQuantity) {
            var fTotal = parseFloat(sTotalQtyDone) || 0;
            var fQty = parseFloat(sQuantity) || 0;
            if (fQty === 0) return "0%";
            var fPct = (fTotal / fQty) * 100;
            return parseFloat(fPct.toFixed(2)) + "%";
        },

        formatProgress: function (sTotalQtyDone, sQuantity) {
            var fTotal = parseFloat(sTotalQtyDone) || 0;
            var fQty = parseFloat(sQuantity) || 0;
            if (fQty === 0) return 0;
            var fPct = (fTotal / fQty) * 100;
            return Math.min(fPct, 100);
        },

        formatCompletionRateTitle: function (sTarget, sUnit) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var fTarget = Math.round(parseFloat(sTarget) || 0);
            var sU = sUnit ? " " + sUnit : "";
            return oBundle.getText("completionRateTitle", [fTarget, sU]);
        },

        formatQtyProgressPercent: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return 0;
            var fActual = parseFloat(this.getView().getModel("workSummaryModel").getProperty("/TotalQtyDone")) || 0;
            var fTarget = parseFloat(oCtx.getProperty("Quantity")) || 0;
            if (fTarget === 0) return 0;
            var fPercent = (fActual / fTarget) * 100;
            return Math.min(fPercent, 100);
        },

        formatQtyProgressState: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "Warning";
            var fActual = parseFloat(this.getView().getModel("workSummaryModel").getProperty("/TotalQtyDone")) || 0;
            var fTarget = parseFloat(oCtx.getProperty("Quantity")) || 0;
            if (fTarget === 0) return "Warning";
            return fActual >= fTarget ? "Success" : "Warning";
        },

        formatQtyProgressDisplay: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "";
            var fActual = parseFloat(this.getView().getModel("workSummaryModel").getProperty("/TotalQtyDone")) || 0;
            var fTarget = parseFloat(oCtx.getProperty("Quantity")) || 0;
            var sUnit = oCtx.getProperty("UnitCode") || "";
            return "Thực tế: " + fActual.toFixed(2).replace(/\.00$/, '') + " / Kế hoạch: " + fTarget.toFixed(2).replace(/\.00$/, '') + " " + sUnit;
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
        /* DATE & DURATION FORMATTERS                                  */
        /* =========================================================== */

        _getDaysDiff: function (d1, d2) {
            if (!d1 || !d2) return 0;
            // Treat as UTC midnight to avoid DST issues
            var t1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
            var t2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
            return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
        },

        formatPlanDateRange: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "—";
            var dStart = oCtx.getProperty("StartDate");
            var dEnd = oCtx.getProperty("EndDate");
            if (!dStart || !dEnd) return "—";
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
            return oDateFormat.format(dStart) + " - " + oDateFormat.format(dEnd);
        },

        formatPlanDuration: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "(Quỹ thời gian: —)";
            var dStart = oCtx.getProperty("StartDate");
            var dEnd = oCtx.getProperty("EndDate");
            if (!dStart || !dEnd) return "(Quỹ thời gian: —)";
            var iDays = WorkSummaryDelegate._getDaysDiff(dStart, dEnd) + 1;
            return "(Quỹ thời gian: " + iDays + " ngày)";
        },

        formatActualDateRange: function (sStatus) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx || !sStatus) return "—";
            var dStartActual = oCtx.getProperty("StartActual");
            var dEndActual = oCtx.getProperty("EndActual");

            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });

            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") {
                return "Chưa bắt đầu";
            }
            if (sStatus === "IN_PROGRESS" || sStatus === "PENDING_CLOSE" || sStatus === "CLOSE_REJECTED") {
                var sActualStartStr = dStartActual ? oDateFormat.format(dStartActual) : "—";
                var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
                var sServerDateStr = oDateFormat.format(dServerDateObj);
                return sActualStartStr + " - " + sServerDateStr + " (Hiện tại)";
            }
            if (sStatus === "CLOSED") {
                var sActualStartStr = dStartActual ? oDateFormat.format(dStartActual) : "—";
                var sActualEndStr = dEndActual ? oDateFormat.format(dEndActual) : "—";
                return sActualStartStr + " - " + sActualEndStr;
            }
            return "—";
        },

        formatActualDuration: function (sStatus) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx || !sStatus) return "";
            var dStart = oCtx.getProperty("StartDate");
            var dStartActual = oCtx.getProperty("StartActual");
            var dEndActual = oCtx.getProperty("EndActual");
            var dEnd = oCtx.getProperty("EndDate");
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();

            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") {
                if (!dStart || !dServerDateObj) return "";
                var x = WorkSummaryDelegate._getDaysDiff(dStart, dServerDateObj);
                if (x < 0) return "(Khởi công sau " + Math.abs(x) + " ngày)";
                if (x === 0) return "(Dự kiến khởi công hôm nay)";
                if (x > 0) return "(Chậm khởi công " + x + " ngày)";
            }
            if (sStatus === "IN_PROGRESS" || sStatus === "PENDING_CLOSE" || sStatus === "CLOSE_REJECTED") {
                if (!dStartActual || !dServerDateObj) return "(Đã thi công: —)";
                var iDays = WorkSummaryDelegate._getDaysDiff(dStartActual, dServerDateObj) + 1;
                return "(Đã thi công: " + iDays + " ngày)";
            }
            if (sStatus === "CLOSED") {
                if (!dStartActual || !dEndActual || !dEnd) return "";
                var x = WorkSummaryDelegate._getDaysDiff(dEnd, dEndActual);

                if (x > 0) return "(Hoàn thành muộn " + x + " ngày)";
                if (x < 0) return "(Hoàn thành sớm " + Math.abs(x) + " ngày)";
                if (x === 0) return "(Hoàn thành đúng hạn)";
            }
            return "";
        },

        formatActualDurationState: function (sStatus) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx || !sStatus) return "None";
            var dStart = oCtx.getProperty("StartDate");
            var dStartActual = oCtx.getProperty("StartActual");
            var dEndActual = oCtx.getProperty("EndActual");
            var dEnd = oCtx.getProperty("EndDate");
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();

            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") {
                if (!dStart || !dServerDateObj) return "None";
                var x = WorkSummaryDelegate._getDaysDiff(dStart, dServerDateObj);
                if (x < 0) return "None";
                if (x === 0) return "Warning";
                if (x > 0) return "Error";
            }
            if (sStatus === "IN_PROGRESS" || sStatus === "PENDING_CLOSE" || sStatus === "CLOSE_REJECTED") {
                return "None";
            }
            if (sStatus === "CLOSED") {
                if (!dEndActual || !dEnd) return "None";
                var x = WorkSummaryDelegate._getDaysDiff(dEnd, dEndActual);
                if (x > 0) return "Error";
                if (x < 0) return "Success";
                if (x === 0) return "Success";
            }
            return "None";
        },

        _calculateTimeElapsed: function (oCtx, dServerDateObj) {
            if (!oCtx) return { used: 0, plan: 0 };

            var dStart = oCtx.getProperty("StartDate");
            var dEnd = oCtx.getProperty("EndDate");
            var dStartActual = oCtx.getProperty("StartActual");
            var dEndActual = oCtx.getProperty("EndActual");
            var sStatus = oCtx.getProperty("Status");

            var planDays = 0;
            if (dStart && dEnd) {
                planDays = WorkSummaryDelegate._getDaysDiff(dStart, dEnd) + 1;
            }

            var usedDays = 0;
            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") {
                usedDays = 0;
            } else if (sStatus === "IN_PROGRESS" || sStatus === "PENDING_CLOSE" || sStatus === "CLOSE_REJECTED") {
                if (dStartActual) {
                    usedDays = WorkSummaryDelegate._getDaysDiff(dStartActual, dServerDateObj) + 1;
                }
            } else if (sStatus === "CLOSED") {
                if (dStartActual && dEndActual) {
                    usedDays = WorkSummaryDelegate._getDaysDiff(dStartActual, dEndActual) + 1;
                }
            }

            usedDays = Math.max(0, usedDays);

            return { used: usedDays, plan: planDays };
        },

        formatTimeElapsedDisplay: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);
            return "Đã dùng: " + oTime.used + " / Kế hoạch: " + oTime.plan + " Ngày";
        },

        formatTimeElapsedPercent: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);
            if (oTime.plan === 0) return 0;
            return Math.min((oTime.used / oTime.plan) * 100, 100);
        },

        formatTimeElapsedPercentStr: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);
            if (oTime.plan === 0) return "0%";
            var fPercent = (oTime.used / oTime.plan) * 100;
            return parseFloat(fPercent.toFixed(2)) + "%";
        },

        formatAverageProductivity: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "0 / Ngày";

            var fTotalQty = parseFloat(sTotalQtyDone) || 0;
            var sUnit = oCtx.getProperty("UnitCode") || "";

            if (fTotalQty === 0) {
                return "0 " + sUnit + " / Ngày";
            }

            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);
            var iUsedDays = oTime.used;

            var fAvgProd = 0;
            if (iUsedDays > 0) {
                fAvgProd = fTotalQty / iUsedDays;
            }

            return parseFloat(fAvgProd.toFixed(2)) + " " + sUnit + " / Ngày";
        },

        _calculateScheduleVariance: function (oCtx, dServerDateObj, sTotalQtyDone) {
            var fQuantity = parseFloat(oCtx.getProperty("Quantity")) || 0;
            var fTotalQtyDone = parseFloat(sTotalQtyDone) || 0;
            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);

            if (fQuantity === 0 || oTime.plan === 0) {
                return { percent: 0, qty: 0 };
            }

            var fTimeElapsedPct = (oTime.used / oTime.plan) * 100;
            var fActualQtyPct = (fTotalQtyDone / fQuantity) * 100;

            // user formula: % thời gian - % khối lượng
            var fVariancePct = fTimeElapsedPct - fActualQtyPct;

            // khối lượng chênh lệch = % chênh lệch * Quantity
            var fVarianceQty = (fVariancePct / 100) * fQuantity;

            return { percent: fVariancePct, qty: fVarianceQty };
        },

        formatScheduleVarianceText: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "";
            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") return "Chưa bắt đầu";

            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oVariance = WorkSummaryDelegate._calculateScheduleVariance(oCtx, dServerDateObj, sTotalQtyDone);
            var sUnit = oCtx.getProperty("UnitCode") || "";

            var fPct = Math.abs(oVariance.percent);
            var fQty = Math.abs(oVariance.qty);

            var sPctStr = parseFloat(fPct.toFixed(2)) + "%";
            var sQtyStr = parseFloat(fQty.toFixed(2)) + " " + sUnit;

            // Nếu % Thời gian > % Khối lượng -> Chậm
            if (oVariance.percent > 0.01) {
                return "Chậm " + sPctStr + " (" + sQtyStr + ")";
            }
            // Nếu % Thời gian < % Khối lượng -> Vượt
            else if (oVariance.percent < -0.01) {
                return "Vượt " + sPctStr + " (" + sQtyStr + ")";
            } else {
                return "Đúng tiến độ";
            }
        },

        formatScheduleVarianceState: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "None";
            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") return "None";

            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oVariance = WorkSummaryDelegate._calculateScheduleVariance(oCtx, dServerDateObj, sTotalQtyDone);

            // Chậm -> Error, Vượt -> Success
            if (oVariance.percent > 0.01) return "Error";
            if (oVariance.percent < -0.01) return "Success";
            return "Success";
        },

        formatScheduleVarianceIcon: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "";
            if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") return "";

            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oVariance = WorkSummaryDelegate._calculateScheduleVariance(oCtx, dServerDateObj, sTotalQtyDone);

            // Chậm -> đi xuống, Vượt -> đi lên
            if (oVariance.percent > 0.01) return "sap-icon://trend-down";
            if (oVariance.percent < -0.01) return "sap-icon://trend-up";
            return "sap-icon://sys-enter-2";
        },

        _calculateForecast: function (oCtx, dServerDateObj, sTotalQtyDone, sStatus) {
            if (["PLANNING", "PENDING_OPEN", "OPEN_REJECTED", "OPENED"].indexOf(sStatus) !== -1) {
                return { status: "NOT_STARTED" };
            }
            if (sStatus === "CLOSED") {
                return { status: "COMPLETED" };
            }

            var fTotalQty = parseFloat(sTotalQtyDone) || 0;
            var fQuantity = parseFloat(oCtx.getProperty("Quantity")) || 0;

            if (fTotalQty === 0 || fQuantity === 0) {
                return { status: "INSUFFICIENT_DATA" };
            }

            if (fTotalQty >= fQuantity) {
                return { status: "ALMOST_DONE" };
            }

            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);

            if (oTime.used === 0) {
                return { status: "INSUFFICIENT_DATA" };
            }

            var fAvgProd = fTotalQty / oTime.used;
            var fQtyRemaining = fQuantity - fTotalQty;
            var iDaysRemaining = Math.ceil(fQtyRemaining / fAvgProd);

            var dForecast = new Date(dServerDateObj.getTime());
            dForecast.setHours(0, 0, 0, 0);
            dForecast.setDate(dForecast.getDate() + iDaysRemaining);

            var dEnd = oCtx.getProperty("EndDate");
            var iDaysDiff = 0;
            if (dEnd) {
                var dEnd_clone = new Date(dEnd.getTime());
                dEnd_clone.setHours(0, 0, 0, 0);
                iDaysDiff = WorkSummaryDelegate._getDaysDiff(dForecast, dEnd_clone); // Positive if dEnd >= dForecast
            }

            return {
                status: "FORECASTED",
                forecastDate: dForecast,
                daysRemaining: iDaysRemaining,
                daysVariance: iDaysDiff
            };
        },

        formatForecastDateText: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "—";
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oForecast = WorkSummaryDelegate._calculateForecast(oCtx, dServerDateObj, sTotalQtyDone, sStatus);

            switch (oForecast.status) {
                case "NOT_STARTED": return "Chưa bắt đầu";
                case "COMPLETED": return "Đã hoàn thành";
                case "INSUFFICIENT_DATA": return "Chưa đủ dữ liệu";
                case "ALMOST_DONE": return "Sắp hoàn thành";
                case "FORECASTED":
                    var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                    return oDateFormat.format(oForecast.forecastDate);
                default: return "—";
            }
        },

        formatRiskAssessmentText: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "—";
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oForecast = WorkSummaryDelegate._calculateForecast(oCtx, dServerDateObj, sTotalQtyDone, sStatus);

            switch (oForecast.status) {
                case "NOT_STARTED": return "Chưa bắt đầu";
                case "COMPLETED": return "Đã hoàn thành";
                case "INSUFFICIENT_DATA": return "Chưa đủ dữ liệu";
                case "ALMOST_DONE": return "Không rủi ro";
                case "FORECASTED":
                    if (oForecast.daysVariance > 0) {
                        return "Khả năng vượt tiến độ " + oForecast.daysVariance + " ngày";
                    } else if (oForecast.daysVariance < 0) {
                        return "Nguy cơ chậm tiến độ " + Math.abs(oForecast.daysVariance) + " ngày";
                    } else {
                        return "Dự kiến đúng tiến độ";
                    }
                default: return "—";
            }
        },

        formatRiskAssessmentState: function (sStatus, sTotalQtyDone) {
            var oCtx = this.getView().getBindingContext();
            if (!oCtx) return "None";
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oForecast = WorkSummaryDelegate._calculateForecast(oCtx, dServerDateObj, sTotalQtyDone, sStatus);

            switch (oForecast.status) {
                case "COMPLETED":
                case "ALMOST_DONE": return "Success";
                case "FORECASTED":
                    if (oForecast.daysVariance > 0) return "Success";
                    if (oForecast.daysVariance < 0) return "Error";
                    return "None";
                default: return "None";
            }
        },

        formatTimeElapsedState: function (vDummy) {
            var oCtx = this.getView().getBindingContext();
            var dServerDateObj = this.getView().getModel("viewData").getProperty("/ServerDateObj") || new Date();
            var oTime = WorkSummaryDelegate._calculateTimeElapsed(oCtx, dServerDateObj);
            if (oTime.plan === 0) return "None";
            var pct = oTime.used / oTime.plan;

            if (pct > 1) return "Error";
            if (pct > 0.8) return "Warning";
            return "Success";
        },

        formatPerformancePanelVisible: function (sStatus) {
            if (!sStatus) return false;
            var aVisibleStatus = ["IN_PROGRESS", "PENDING_CLOSE", "CLOSE_REJECTED", "CLOSED"];
            return aVisibleStatus.indexOf(sStatus) !== -1;
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
