sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/Token",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/ui/table/Column"
], function (Controller, History, MessageToast, MessageBox,
    Dialog, Button, Label, Input, Select, Item, VBox, HBox, SimpleForm, Filter, FilterOperator,
    JSONModel, ValueHelpDialog, FilterBar, FilterGroupItem, Token, MColumn, ColumnListItem, Text, UITableColumn) {
    "use strict";

    return Controller.extend("z.bts.buildtrack551.controller.Site", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                hasData: false,
                chartData: [],
                dimensionName: "Date",
                plannedMeasureName: "Planned",
                actualMeasureName: "Actual",
                measureNames: ["Planned", "Actual"]
            }), "chartModel");

            this._applyChartI18nLabels();

            this.getView().setModel(new JSONModel({
                ProjectProgress: 0,
                ProjectProgressStr: "0.00%",
                ProjectProgressState: "None",
                ProjectActualStartStr: "---",
                ProjectActualEndStr: "---",
                Sites: []
            }), "projectSummaryModel");

            this.getView().setModel(new JSONModel({
                siteCodeItems: [],
                siteNameItems: [],
                addressItems: []
            }), "siteVh");

            this.getView().setModel(new JSONModel({
                Approver1Id: "",
                Approver2Id: "",
                Approver3Id: "",
                Approver1Name: "",
                Approver2Name: "",
                Approver3Name: "",
                Approver1Email: "",
                Approver2Email: "",
                Approver3Email: "",
                _exists: false
            }), "approver");

            this.getView().setModel(new JSONModel({
                items: [],
                count: 0
            }), "users");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Site").attachPatternMatched(this._onObjectMatched, this);
            sap.ui.getCore().getEventBus().subscribe("Global", "RefreshData", this._onGlobalRefresh, this);
        },

        _applyChartI18nLabels: function () {
            var oChartModel = this.getView().getModel("chartModel");
            var oI18nModel = this.getView().getModel("i18n");
            if (!oChartModel || !oI18nModel) {
                return;
            }

            var oBundle = oI18nModel.getResourceBundle();
            var sDimensionName = oBundle.getText("date");
            var sPlannedMeasureName = oBundle.getText("planned");
            var sActualMeasureName = oBundle.getText("actual");

            oChartModel.setProperty("/dimensionName", sDimensionName);
            oChartModel.setProperty("/plannedMeasureName", sPlannedMeasureName);
            oChartModel.setProperty("/actualMeasureName", sActualMeasureName);
            oChartModel.setProperty("/measureNames", [sPlannedMeasureName, sActualMeasureName]);

            var oViz = this.byId("chartBurnDown");
            if (oViz && oViz.getFeeds) {
                (oViz.getFeeds() || []).forEach(function (oFeed) {
                    var sUid = oFeed && oFeed.getUid ? oFeed.getUid() : "";
                    if (sUid === "categoryAxis") {
                        oFeed.setValues([sDimensionName]);
                    } else if (sUid === "valueAxis") {
                        oFeed.setValues([sPlannedMeasureName, sActualMeasureName]);
                    }
                });
            }
        },

        // ── FORMATTERS ──────────────────────────────────────────────────────
        formatSiteListTitle: function (sProjectName) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText("siteListTitle", [sProjectName || ""]);
        },

        formatTypeState: function (sType) {
            return "None";
        },

        formatTypeText: function (sType) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sKey = (sType || "").toUpperCase();
            var mLabels = {
                "ROAD": oBundle.getText("typeRoad"),
                "ĐƯỜNG BỘ": oBundle.getText("typeRoad"),
                "BRIDGE": oBundle.getText("typeBridge"),
                "CẦU": oBundle.getText("typeBridge"),
                "BUILDING": oBundle.getText("typeBuilding"),
                "TÒA NHÀ": oBundle.getText("typeBuilding"),
                "TOÀ NHÀ": oBundle.getText("typeBuilding"),
                "TUNNEL": oBundle.getText("typeTunnel"),
                "HẦM": oBundle.getText("typeTunnel"),
                "OTHER": oBundle.getText("typeOther"),
                "LOẠI KHÁC": oBundle.getText("typeOther"),
                "KHÁC": oBundle.getText("typeOther")
            };
            return mLabels[sKey] || sType;
        },

        // formatStatusIcon: function (sStatus) {
        //     var m = {
        //         "PLANNING": "sap-icon://status-in-process",
        //         "IN_PROGRESS": "sap-icon://play",
        //         "CLOSED": "sap-icon://status-negative"
        //     };
        //     return m[(sStatus || "").toUpperCase()] || "sap-icon://status-inactive";
        // },

        formatStatusState: function (sStatus) {
            var m = {
                "PLANNING": "Information",
                "IN_PROGRESS": "Warning",
                "CLOSED": "Success"
            };
            return m[(sStatus || "").toUpperCase()] || "None";
        },

        formatStatusText: function (sStatus) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var mLabels = {
                "PLANNING": oBundle.getText("planningStatus"),
                "IN_PROGRESS": oBundle.getText("inProgressStatus"),
                "CLOSED": oBundle.getText("closedStatus")
            };
            return mLabels[(sStatus || "").toUpperCase()] || sStatus;
        },

        _onObjectMatched: function (oEvent) {
            var sProjectId = oEvent.getParameter("arguments").project_id;
            this._sCurrentProjectId = sProjectId;
            this._sSiteVhProjectId = null;

            this._applyChartI18nLabels();

            this._resetSiteFilterState();

            var oVhModel = this.getView().getModel("siteVh");
            if (oVhModel) {
                oVhModel.setProperty("/siteCodeItems", []);
                oVhModel.setProperty("/siteNameItems", []);
                oVhModel.setProperty("/addressItems", []);
            }

            var oView = this.getView();
            this.getView().bindElement({
                path: "/ProjectSet(guid'" + sProjectId + "')",
                parameters: { expand: "ToSites" },
                events: {
                    dataRequested: function () { oView.setBusy(true); },
                    dataReceived: function () {
                        oView.setBusy(false);
                        this._loadSiteValueHelps(function () {
                            this._warmUpSiteValueHelpDialogs();
                        }.bind(this));

                        // Load both users and approvers
                        this._fetchUserRoles(function () {
                            this._loadApproverData(sProjectId);
                        }.bind(this));

                        // Load chart data
                        var oCtx = oView.getBindingContext();
                        var oProjectObj = oCtx && oCtx.getObject ? oCtx.getObject() : null;
                        this._loadChartData(oProjectObj);
                    }.bind(this)
                }
            });

            // Force refresh to bypass OData entity cache on every navigation (including back)
            var oElementBinding = this.getView().getElementBinding();
            if (oElementBinding) {
                oElementBinding.refresh(true);
            }
        },

        _loadChartData: function (oProjectObj) {
            var oChartModel = this.getView().getModel("chartModel");
            var oSummaryModel = this.getView().getModel("projectSummaryModel");

            // Xóa dữ liệu cũ để tránh lỗi hiển thị nhầm dữ liệu của Project trước đó
            oChartModel.setProperty("/hasData", false);
            oChartModel.setProperty("/chartData", []);

            oSummaryModel.setData({
                ProjectProgress: 0,
                ProjectProgressStr: "0.00%",
                ProjectProgressState: "None",
                ProjectTimePct: 0,
                ProjectTimeStr: "---",
                ProjectTimeState: "None",
                ProjectActualStartStr: "---",
                ProjectActualEndStr: "---",
                Sites: []
            });

            if (!oProjectObj || !oProjectObj.StartDate || !oProjectObj.EndDate || !oProjectObj.ProjectId) {
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var sProjectId = oProjectObj.ProjectId;

            // Step 1: Read sites via navigation path (backend only filters correctly this way)
            oModel.read("/ProjectSet(guid'" + sProjectId + "')/ToSites", {
                success: function (oSiteData) {
                    var aSites = oSiteData.results || [];
                    if (aSites.length === 0) {
                        oChartModel.setProperty("/hasData", false);
                        return;
                    }

                    var mSiteIds = {};
                    aSites.forEach(function (s) { mSiteIds[s.SiteId] = true; });

                    // Step 2: Read ALL WBS, filter client-side
                    oModel.read("/WBSSet", {
                        success: function (oWbsData) {
                            var aAllWbs = oWbsData.results || [];

                            // Keep only WBS belonging to this project's sites
                            var aProjectWbs = aAllWbs.filter(function (w) {
                                return mSiteIds[w.SiteId];
                            });

                            // Identify parent nodes (nodes that have children)
                            var mParentIds = {};
                            aProjectWbs.forEach(function (w) {
                                if (w.ParentId) {
                                    var sNormPid = String(w.ParentId).toLowerCase();
                                    mParentIds[sNormPid] = true;
                                }
                            });

                            // Identify root WBS nodes (no parent or empty GUID parent)
                            var mRootIds = {};
                            aProjectWbs.forEach(function (w) {
                                var sPid = w.ParentId ? String(w.ParentId).replace(/-/g, "") : "";
                                if (!sPid || /^0+$/.test(sPid)) {
                                    mRootIds[String(w.WbsId).toLowerCase()] = true;
                                }
                            });

                            // Keep only TRUE leaf tasks: no children AND parent is not a root
                            // (i.e., depth >= 3 in the tree; excludes section/category nodes
                            //  that sit directly under the site root without sub-tasks)
                            var aLeafWbs = aProjectWbs.filter(function (w) {
                                var sNormId = String(w.WbsId).toLowerCase();
                                var sNormPid = w.ParentId ? String(w.ParentId).toLowerCase() : "";
                                var sStatus = (w.Status || "").toUpperCase();
                                var bIsExcluded = (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED");
                                return !mParentIds[sNormId] && !mRootIds[sNormPid] && !bIsExcluded;
                            });

                            console.log("[CHART] Sites:", aSites.length, "All WBS:", aAllWbs.length, "Project WBS:", aProjectWbs.length, "Leaf:", aLeafWbs.length);

                            that._processBurnDownChartData(oProjectObj, aLeafWbs);
                            that._loadProjectProgressRollup(oProjectObj, aProjectWbs, aSites);
                        },
                        error: function () {
                            oChartModel.setProperty("/hasData", false);
                        }
                    });
                },
                error: function () {
                    oChartModel.setProperty("/hasData", false);
                }
            });
        },

        _processBurnDownChartData: function (oProjectObj, aWbs) {
            var oChartModel = this.getView().getModel("chartModel");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            var iTotalWbs = aWbs.length;
            if (iTotalWbs === 0) {
                oChartModel.setProperty("/hasData", false);
                return;
            }

            var oProjectStart = new Date(oProjectObj.StartDate);
            oProjectStart.setHours(0, 0, 0, 0);
            var oProjectEnd = new Date(oProjectObj.EndDate);
            oProjectEnd.setHours(0, 0, 0, 0);

            if (oProjectEnd < oProjectStart) {
                oChartModel.setProperty("/hasData", false);
                return;
            }

            // --- Xác định Min/Max từ các Leaf WBS ---
            var dMinLeafStart = null;
            var dMaxLeafEnd = null;

            aWbs.forEach(function (w) {
                if (w.StartDate) {
                    var dS = new Date(w.StartDate); dS.setHours(0, 0, 0, 0);
                    if (!dMinLeafStart || dS < dMinLeafStart) dMinLeafStart = dS;
                }
                if (w.EndDate) {
                    var dE = new Date(w.EndDate); dE.setHours(0, 0, 0, 0);
                    if (!dMaxLeafEnd || dE > dMaxLeafEnd) dMaxLeafEnd = dE;
                }
            });

            // Nếu không có Leaf nào có ngày, fallback về Project
            var oIdealStart = dMinLeafStart ? new Date(dMinLeafStart) : new Date(oProjectStart);
            var oIdealEnd = dMaxLeafEnd ? new Date(dMaxLeafEnd) : new Date(oProjectEnd);

            // --- Xác định biên mở rộng của Chart (MIN/MAX Dates) ---
            var oChartStartDate = new Date(oIdealStart);
            var oChartEndDate = new Date(oIdealEnd);

            aWbs.forEach(function (w) {
                if (w.StartActual) {
                    var d = new Date(w.StartActual); d.setHours(0, 0, 0, 0);
                    if (d < oChartStartDate) oChartStartDate = d;
                }
                if (w.EndActual) {
                    var d = new Date(w.EndActual); d.setHours(0, 0, 0, 0);
                    if (d > oChartEndDate) oChartEndDate = d;
                }
            });

            var oViewData = this.getView().getModel("viewData");
            var oToday = oViewData ? (oViewData.getProperty("/ServerDateObj") || new Date()) : new Date();
            oToday = new Date(oToday);
            oToday.setHours(0, 0, 0, 0);

            // Nếu hôm nay vượt quá Chart End Date nhưng dự án chưa xong, kéo dài trục X tới hôm nay
            if (oToday > oChartEndDate) {
                var iClosed = aWbs.filter(function (w) { return (w.Status || "").toUpperCase() === "CLOSED"; }).length;
                if (iClosed < iTotalWbs) {
                    oChartEndDate = new Date(oToday);
                }
            }

            // Đảm bảo Chart End Date tối thiểu phải chạm mốc Deadline dự án
            if (oProjectEnd > oChartEndDate) {
                oChartEndDate = new Date(oProjectEnd);
            }

            var fnGetDaysDiff = function (d1, d2) {
                if (!d1 || !d2) return 0;
                var t1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
                var t2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
                return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
            };

            var iChartDays = fnGetDaysDiff(oChartStartDate, oChartEndDate) + 1;
            var iStep = Math.ceil(iChartDays / 30);
            if (iStep < 1) iStep = 1;

            var iProjectPlanDays = fnGetDaysDiff(oIdealStart, oIdealEnd) + 1;
            if (iProjectPlanDays <= 0) iProjectPlanDays = 1;
            var fDailyBurnRate = iTotalWbs / iProjectPlanDays;

            // 1. Generate stepped dates
            var aUniqueDates = [];
            var dTemp = new Date(oChartStartDate);
            while (dTemp <= oChartEndDate) {
                aUniqueDates.push(new Date(dTemp));
                dTemp.setDate(dTemp.getDate() + iStep);
            }

            // Đảm bảo có Project End (Deadline)
            var bHasProjectEnd = aUniqueDates.some(function (d) { return d.getTime() === oProjectEnd.getTime(); });
            if (!bHasProjectEnd && oProjectEnd >= oChartStartDate && oProjectEnd <= oChartEndDate) {
                aUniqueDates.push(new Date(oProjectEnd));
            }

            // Đảm bảo có Chart End
            var bHasChartEnd = aUniqueDates.some(function (d) { return d.getTime() === oChartEndDate.getTime(); });
            if (!bHasChartEnd) {
                aUniqueDates.push(new Date(oChartEndDate));
            }

            aUniqueDates.sort(function (a, b) { return a.getTime() - b.getTime(); });

            function fmtDate(d) {
                return String(d.getDate()).padStart(2, '0') + "/" +
                    String(d.getMonth() + 1).padStart(2, '0') + "/" +
                    String(d.getFullYear()).slice(-2);
            }

            var aChartData = [];



            aUniqueDates.forEach(function (oDate) {
                var sDateStr = fmtDate(oDate);

                // Planned: Ideal Line
                var fPlanned = null;
                var iDaysFromPlanStart = fnGetDaysDiff(oIdealStart, oDate) + 1;

                if (iDaysFromPlanStart <= 0) {
                    fPlanned = iTotalWbs;
                } else if (iDaysFromPlanStart >= iProjectPlanDays) {
                    fPlanned = 0;
                } else {
                    fPlanned = Math.max(0, iTotalWbs - (fDailyBurnRate * iDaysFromPlanStart));
                }
                fPlanned = Math.round(fPlanned * 100) / 100;

                // Actual: WBS NOT YET closed
                var fActual = null;
                if (oDate.getTime() <= oToday.getTime()) {
                    var iClosed = 0;
                    aWbs.forEach(function (w) {
                        if ((w.Status || "").toUpperCase() === "CLOSED") {
                            var oCloseDate = w.EndActual ? new Date(w.EndActual) : null;
                            if (oCloseDate) {
                                oCloseDate.setHours(0, 0, 0, 0);
                                if (oCloseDate.getTime() <= oDate.getTime()) {
                                    iClosed++;
                                }
                            }
                        }
                    });
                    fActual = iTotalWbs - iClosed;
                }

                if (oDate.getTime() === oProjectEnd.getTime()) {
                    sDateStr += " 🚩";
                }

                aChartData.push({
                    Date: sDateStr,
                    Planned: fPlanned,
                    Actual: fActual
                });
            });

            oChartModel.setProperty("/chartData", aChartData);
            oChartModel.setProperty("/hasData", true);

            // Apply vizProperties programmatically
            var oViz = this.byId("chartBurnDown");
            if (oViz) {
                oViz.setVizProperties({
                    title: { visible: false },
                    legend: { visible: true },
                    plotArea: {
                        dataLabel: { visible: false },
                        colorPalette: ["#5899DA", "#E8743B"],
                        line: { marker: { visible: true, size: 4 } }
                    },
                    categoryAxis: {
                        title: { visible: false },
                        label: { rotation: "auto" }
                    },
                    valueAxis: {
                        title: { visible: false },
                        label: { formatString: "0" },
                        axisTick: { shortTickVisible: false },
                        scale: { fixedRange: true, minValue: 0, maxValue: Math.max(iTotalWbs, 4) }
                    },
                    interaction: {
                        selectability: { mode: "EXCLUSIVE" }
                    }
                });
            }
        },

        _loadProjectProgressRollup: function (oProjectObj, aAllWbs, aSites) {
            var oSummaryModel = this.getView().getModel("projectSummaryModel");
            if (!aAllWbs || aAllWbs.length === 0) {
                oSummaryModel.setProperty("/ProjectProgress", 0);
                oSummaryModel.setProperty("/ProjectProgressStr", "0.00%");
                return;
            }

            // 1. Build a Tree Map of WBS
            var mWbsMap = {};
            var aRootWbs = [];
            var mRootIds = {};
            aAllWbs.forEach(function (w) {
                w._children = [];
                mWbsMap[w.WbsId] = w;
                var sPid = w.ParentId ? String(w.ParentId).replace(/-/g, "") : "";
                if (!sPid || /^0+$/.test(sPid)) {
                    mRootIds[String(w.WbsId).toLowerCase()] = true;
                }
            });

            aAllWbs.forEach(function (w) {
                if (w.ParentId && mWbsMap[w.ParentId]) {
                    mWbsMap[w.ParentId]._children.push(w);
                } else {
                    aRootWbs.push(w);
                }
            });

            // 2. Recursive Roll-up Function
            var fnGetDaysDiff = function (d1, d2) {
                if (!d1 || !d2) return 0;
                var t1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
                var t2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
                return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
            };

            var oViewData = this.getView().getModel("viewData");
            var dToday = oViewData ? (oViewData.getProperty("/ServerDateObj") || new Date()) : new Date();
            dToday = new Date(dToday);
            dToday.setHours(0, 0, 0, 0);

            var fnCalculateProgress = function (oNode) {
                var dStart = oNode.StartDate ? new Date(oNode.StartDate) : null;
                var dEnd = oNode.EndDate ? new Date(oNode.EndDate) : null;
                var iDuration = 0;
                if (dStart && dEnd) {
                    iDuration = fnGetDaysDiff(dStart, dEnd) + 1;
                }
                if (iDuration < 0) iDuration = 0;

                oNode._calendarDuration = iDuration;

                var sNormId = String(oNode.WbsId).toLowerCase();
                var sNormPid = oNode.ParentId ? String(oNode.ParentId).toLowerCase() : "";
                var bIsRoot = mRootIds[sNormId];
                var bParentIsRoot = mRootIds[sNormPid];

                // Leaf Node: no children AND not a root AND parent is not a root
                if (oNode._children.length === 0 && !bIsRoot && !bParentIsRoot) {
                    var fQty = parseFloat(oNode.Quantity) || 0;
                    var fDone = parseFloat(oNode.TotalQuantityDone) || 0;
                    var sStatus = (oNode.Status || "").toUpperCase();
                    var fProgress = 0;
                    var fPlanProgress = 0;

                    if (sStatus === "CLOSED") {
                        fProgress = 100;
                    } else if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") {
                        fProgress = 0;
                    } else {
                        fProgress = fQty > 0 ? (fDone / fQty) * 100 : 0;
                        if (fProgress > 100) fProgress = 100;
                    }

                    if (dStart && dEnd) {
                        if (iDuration > 0) {
                            var usedDays = fnGetDaysDiff(dStart, dToday) + 1;
                            fPlanProgress = Math.min(Math.max(usedDays / iDuration, 0), 1) * 100;
                        }
                    }

                    oNode._progress = fProgress;
                    oNode._planProgress = fPlanProgress;
                    oNode._leafWeight = iDuration;

                    var oStartActual = oNode.StartActual ? new Date(oNode.StartActual) : null;
                    var oEndActual = oNode.EndActual ? new Date(oNode.EndActual) : null;
                    oNode._computedStartActual = oStartActual;
                    oNode._computedEndActual = (sStatus === "CLOSED") ? oEndActual : null;
                    oNode._isAllClosed = (sStatus === "CLOSED");
                }
                // Parent Node
                else {
                    var fTotalLeafWeight = 0;
                    var fWeightedProgressSum = 0;
                    var fWeightedPlanProgressSum = 0;
                    var oMinStart = null;
                    var oMaxEnd = null;
                    // Start as false: only set true when there are actual leaf tasks AND all are closed
                    var bAllClosed = false;
                    var bHasLeafTasks = false;

                    oNode._children.forEach(function (child) {
                        fnCalculateProgress(child);

                        var sChildStatus = (child.Status || "").toUpperCase();
                        var bIsExcluded = (sChildStatus === "PLANNING" || sChildStatus === "PENDING_OPEN" || sChildStatus === "OPEN_REJECTED");

                        var fChildWeight = child._leafWeight > 0 ? child._leafWeight : 0;

                        if (!bIsExcluded) {
                            fTotalLeafWeight += fChildWeight;
                            fWeightedProgressSum += ((child._progress > 100 ? 100 : child._progress) * fChildWeight);
                            fWeightedPlanProgressSum += ((child._planProgress || 0) * fChildWeight);
                            // Track if there are real leaf tasks contributing
                            if (fChildWeight > 0) { bHasLeafTasks = true; }
                        }

                        if (child._computedStartActual) {
                            if (!oMinStart || child._computedStartActual < oMinStart) oMinStart = child._computedStartActual;
                        }

                        if (child._computedEndActual) {
                            if (!oMaxEnd || child._computedEndActual > oMaxEnd) oMaxEnd = child._computedEndActual;
                        }

                        if (child._isAllClosed && fChildWeight > 0) {
                            bHasLeafTasks = true;
                            bAllClosed = true;
                        } else if (!child._isAllClosed && fChildWeight > 0) {
                            bAllClosed = false;
                        }
                    });

                    // If no children contributed any leaf weight, ensure bAllClosed stays false
                    if (!bHasLeafTasks) { bAllClosed = false; }

                    var sStatus = (oNode.Status || "").toUpperCase();
                    if (sStatus === "CLOSED") {
                        oNode._progress = 100;
                    } else if (sStatus === "PLANNING" || sStatus === "PENDING_OPEN" || sStatus === "OPEN_REJECTED" || sStatus === "OPENED") {
                        oNode._progress = 0;
                    } else {
                        oNode._progress = fTotalLeafWeight > 0 ? (fWeightedProgressSum / fTotalLeafWeight) : 0;
                    }

                    oNode._planProgress = fTotalLeafWeight > 0 ? (fWeightedPlanProgressSum / fTotalLeafWeight) : 0;
                    oNode._leafWeight = fTotalLeafWeight;
                    oNode._computedStartActual = oMinStart;
                    oNode._computedEndActual = bAllClosed ? oMaxEnd : null;
                    oNode._isAllClosed = bAllClosed;
                }
            };

            // 3. Roll-up Sites & Project
            var fProjectTotalWeight = 0;
            var fProjectWeightedProgressSum = 0;
            var fProjectWeightedPlanProgressSum = 0;
            var oProjectStartActual = null;
            var oProjectEndActual = null;
            var bProjectAllClosed = true;

            var mSiteRootMap = {};
            aRootWbs.forEach(function (root) {
                fnCalculateProgress(root);
                mSiteRootMap[root.SiteId] = root;

                var sRootStatus = (root.Status || "").toUpperCase();
                var bIsExcluded = (sRootStatus === "PLANNING" || sRootStatus === "PENDING_OPEN" || sRootStatus === "OPEN_REJECTED");

                var fSiteWeight = root._leafWeight > 0 ? root._leafWeight : 0;

                if (!bIsExcluded) {
                    fProjectTotalWeight += fSiteWeight;
                    fProjectWeightedProgressSum += (root._progress * fSiteWeight);
                    fProjectWeightedPlanProgressSum += ((root._planProgress || 0) * fSiteWeight);
                }

                if (root._computedStartActual) {
                    if (!oProjectStartActual || root._computedStartActual < oProjectStartActual) oProjectStartActual = root._computedStartActual;
                }
                if (root._computedEndActual) {
                    if (!oProjectEndActual || root._computedEndActual > oProjectEndActual) oProjectEndActual = root._computedEndActual;
                }
                if (!root._isAllClosed) {
                    bProjectAllClosed = false;
                }
            });

            var fProjectProgress = fProjectTotalWeight > 0 ? (fProjectWeightedProgressSum / fProjectTotalWeight) : 0;
            var fProjectPlanProgress = fProjectTotalWeight > 0 ? (fProjectWeightedPlanProgressSum / fProjectTotalWeight) : 0;

            // Tính Thời gian tiêu hao của Dự án từ ProjectObj
            var oQtyFmt = sap.ui.core.format.NumberFormat.getFloatInstance({ minFractionDigits: 2, maxFractionDigits: 2 });
            var fProjectTimePctUncapped = 0;
            var fProjectTimePct = 0;

            var dProjStart = oProjectObj && oProjectObj.StartDate ? new Date(oProjectObj.StartDate) : null;
            if (dProjStart) dProjStart.setHours(0, 0, 0, 0);
            var dProjEnd = oProjectObj && oProjectObj.EndDate ? new Date(oProjectObj.EndDate) : null;
            if (dProjEnd) dProjEnd.setHours(0, 0, 0, 0);

            var iProjectPlanDays = 0;
            var iProjectUsedDays = 0;

            if (dProjStart && dProjEnd) {
                iProjectPlanDays = fnGetDaysDiff(dProjStart, dProjEnd) + 1;
            }
            if (dProjStart && iProjectPlanDays > 0) {
                if (bProjectAllClosed && oProjectEndActual) {
                    iProjectUsedDays = fnGetDaysDiff(dProjStart, oProjectEndActual) + 1;
                } else {
                    iProjectUsedDays = fnGetDaysDiff(dProjStart, dToday) + 1;
                }
                if (iProjectUsedDays < 0) iProjectUsedDays = 0;
                fProjectTimePctUncapped = (iProjectUsedDays / iProjectPlanDays) * 100;
                fProjectTimePct = Math.min(fProjectTimePctUncapped, 100);
            }

            // Map to Sites Array for UI
            var aSiteSummaries = [];
            aSites.forEach(function (site) {
                var oRoot = mSiteRootMap[site.SiteId];
                var fProgress = oRoot ? oRoot._progress : 0;
                var fWeight = oRoot && oRoot._leafWeight > 0 ? oRoot._leafWeight : 0;
                var fContribution = fProjectTotalWeight > 0 ? (fWeight / fProjectTotalWeight) * 100 : 0;

                // Thời gian tiêu hao của Site (dựa vào StartDate/EndDate của Root WBS)
                var iSitePlanDays = oRoot ? oRoot._calendarDuration : 0;
                var fSiteTimePctUncapped = 0;
                var fSiteTimePct = 0;
                var iSiteUsedDays = 0;
                var dRootStart = oRoot && oRoot.StartDate ? new Date(oRoot.StartDate) : null;
                if (dRootStart && iSitePlanDays > 0) {
                    var bSiteClosed = oRoot && oRoot._isAllClosed;
                    if (bSiteClosed && oRoot._computedEndActual) {
                        iSiteUsedDays = fnGetDaysDiff(dRootStart, oRoot._computedEndActual) + 1;
                    } else {
                        iSiteUsedDays = fnGetDaysDiff(dRootStart, dToday) + 1;
                    }
                    if (iSiteUsedDays < 0) iSiteUsedDays = 0;
                    fSiteTimePctUncapped = (iSiteUsedDays / iSitePlanDays) * 100;
                    fSiteTimePct = Math.min(fSiteTimePctUncapped, 100);
                }
                var sTimeStr = iSiteUsedDays + " / " + iSitePlanDays + " Ngày (" + oQtyFmt.format(fSiteTimePctUncapped) + "%)";

                // Đánh giá
                var sSiteStatus = (site.Status || "").toUpperCase();
                var sAssessmentText, sAssessmentState;
                var bHasWork = oRoot && oRoot._leafWeight > 0;
                if (sSiteStatus === "CLOSED" || (bHasWork && oRoot._isAllClosed)) {
                    sAssessmentText = "Hoàn thành";
                    sAssessmentState = "Success";
                } else if (!bHasWork || sSiteStatus === "PLANNING" || sSiteStatus === "PENDING_OPEN" || sSiteStatus === "OPEN_REJECTED" || sSiteStatus === "OPENED") {
                    sAssessmentText = "Chưa thi công";
                    sAssessmentState = "None";
                } else {
                    var fPlanProg = oRoot && oRoot._planProgress ? oRoot._planProgress : 0;
                    var fDiff = fPlanProg - fProgress;
                    if (fDiff > 10) {
                        sAssessmentText = "Chậm (" + oQtyFmt.format(fDiff) + "%)";
                        sAssessmentState = "Error";
                    } else if (fDiff > 0) {
                        sAssessmentText = "Chậm (" + oQtyFmt.format(fDiff) + "%)";
                        sAssessmentState = "Warning";
                    } else if (fDiff < 0) {
                        sAssessmentText = "Vượt (" + oQtyFmt.format(Math.abs(fDiff)) + "%)";
                        sAssessmentState = "Success";
                    } else {
                        sAssessmentText = "Đúng tiến độ";
                        sAssessmentState = "Success";
                    }
                }

                aSiteSummaries.push({
                    SiteId: site.SiteId,
                    SiteCode: site.SiteCode,
                    SiteName: site.SiteName,
                    Status: site.Status,
                    Progress: fProgress,
                    ProgressStr: fProgress.toFixed(2) + "%",
                    PlanProgress: oRoot && oRoot._planProgress ? oRoot._planProgress : 0,
                    PlanProgressStr: (oRoot && oRoot._planProgress ? oRoot._planProgress : 0).toFixed(2) + "%",
                    ContributionStr: fContribution.toFixed(2) + "%",
                    TimeStr: sTimeStr,
                    TimePct: fSiteTimePct,
                    AssessmentText: sAssessmentText,
                    AssessmentState: sAssessmentState,
                    StartActual: oRoot ? oRoot._computedStartActual : null,
                    EndActual: oRoot ? oRoot._computedEndActual : null
                });
            });

            // Sort sites by progress
            aSiteSummaries.sort(function (a, b) { return b.Progress - a.Progress; });

            var fnFormatDate = function (d) {
                if (!d) return "---";
                return sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" }).format(d);
            };

            oSummaryModel.setProperty("/ProjectProgress", fProjectProgress);
            oSummaryModel.setProperty("/ProjectProgressStr", fProjectProgress.toFixed(2) + "%");
            // --- State dong bo voi WorkSummaryDelegate ---
            var sProjectTimeState = "Success";
            if (fProjectTimePctUncapped > 100) sProjectTimeState = "Error";
            else if (fProjectTimePctUncapped > 80) sProjectTimeState = "Warning";

            var sProjectProgressState;
            if (fProjectProgress >= 100) {
                sProjectProgressState = "Success";
            } else {
                var fProjDiff = fProjectPlanProgress - fProjectProgress;
                if (fProjDiff > 10) sProjectProgressState = "Error";
                else if (fProjDiff > 0) sProjectProgressState = "Warning";
                else sProjectProgressState = "Success";
            }

            oSummaryModel.setProperty("/ProjectProgressState", sProjectProgressState);
            oSummaryModel.setProperty("/ProjectPlanProgress", fProjectPlanProgress);
            oSummaryModel.setProperty("/ProjectPlanProgressStr", fProjectPlanProgress.toFixed(2) + "%");
            oSummaryModel.setProperty("/ProjectTimePct", fProjectTimePct);
            oSummaryModel.setProperty("/ProjectTimeStr", iProjectUsedDays + " / " + iProjectPlanDays + " Ngày (" + oQtyFmt.format(fProjectTimePctUncapped) + "%)");
            oSummaryModel.setProperty("/ProjectTimeState", sProjectTimeState);
            oSummaryModel.setProperty("/ProjectActualStartStr", fnFormatDate(oProjectStartActual));
            oSummaryModel.setProperty("/ProjectActualEndStr", bProjectAllClosed ? fnFormatDate(oProjectEndActual) : "---");
            oSummaryModel.setProperty("/Sites", aSiteSummaries);
        },

        _fetchUserRoles: function (fnSuccess) {
            var oModel = this.getOwnerComponent().getModel();
            var oUsersModel = this.getView().getModel("users");

            oModel.read("/UserRoleSet", {
                success: function (oData) {
                    var aItems = oData.results || [];
                    oUsersModel.setProperty("/items", aItems);
                    oUsersModel.setProperty("/count", aItems.length);
                    if (fnSuccess) fnSuccess();
                },
                error: function () {
                    oUsersModel.setProperty("/items", []);
                    if (fnSuccess) fnSuccess();
                }
            });
        },

        _enrichApproverData: function (oApproverData) {
            var aUsers = this.getView().getModel("users").getProperty("/items") || [];
            var findUser = function (id) {
                return aUsers.find(function (u) { return u.UserId === id; }) || null;
            };

            var u1 = findUser(oApproverData.Approver1Id);
            var u2 = findUser(oApproverData.Approver2Id);
            var u3 = findUser(oApproverData.Approver3Id);

            oApproverData.Approver1Name = u1 ? u1.UserName : "";
            oApproverData.Approver1Email = u1 ? u1.Email : "";
            oApproverData.Approver2Name = u2 ? u2.UserName : "";
            oApproverData.Approver2Email = u2 ? u2.Email : "";
            oApproverData.Approver3Name = u3 ? u3.UserName : "";
            oApproverData.Approver3Email = u3 ? u3.Email : "";

            return oApproverData;
        },

        _loadApproverData: function (sProjectId) {
            var oModel = this.getOwnerComponent().getModel();
            var oApproverModel = this.getView().getModel("approver");
            var that = this;

            oModel.read("/ApproverSet(guid'" + sProjectId + "')", {
                success: function (oData) {
                    var oPayload = {
                        Approver1Id: oData.Approver1Id || "",
                        Approver2Id: oData.Approver2Id || "",
                        Approver3Id: oData.Approver3Id || "",
                        _exists: true
                    };
                    that._enrichApproverData(oPayload);
                    oApproverModel.setData(oPayload);
                },
                error: function (oError) {
                    // 404 = approver not configured yet
                    // No need to show error message box here as it's an expected state
                    var oPayload = {
                        Approver1Id: "",
                        Approver2Id: "",
                        Approver3Id: "",
                        _exists: false
                    };
                    that._enrichApproverData(oPayload);
                    oApproverModel.setData(oPayload);

                    // Log to console only if it's NOT a 404 to avoid confusing debug logs
                    if (oError && oError.statusCode !== "404") {
                        console.error("Error loading ApproverSet:", oError);
                    }
                }
            });
        },

        _resetSiteFilterState: function () {
            ["fbSiteCode", "fbSiteName", "fbSiteStatus", "fbSiteAddress", "fbSiteCreatedOn"].forEach(function (sId) {
                var oControl = this.byId(sId);
                if (oControl && sId === "fbSiteStatus" && oControl.setSelectedKey) {
                    oControl.setSelectedKey("");
                } else if (oControl && oControl.setValue) {
                    oControl.setValue("");
                }
            }.bind(this));

            var oTable = this.byId("siteTable");
            var oBinding = oTable && oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _normalizeCaseInsensitiveText: function (vText) {
            return (vText == null ? "" : String(vText)).trim().toLocaleLowerCase();
        },

        _loadSiteValueHelps: function (fnDone) {
            var oModel = this.getOwnerComponent().getModel();
            var oVhModel = this.getView().getModel("siteVh");
            if (!oModel || !oVhModel || !this._sCurrentProjectId) {
                if (fnDone) {
                    fnDone();
                }
                return;
            }

            var fnSetValueHelpItems = function (aRows) {
                var mCodes = Object.create(null);
                var mNames = Object.create(null);
                var mAddresses = Object.create(null);

                (aRows || []).forEach(function (oRow) {
                    var sCode = (oRow.SiteCode || "").trim();
                    var sName = (oRow.SiteName || "").trim();
                    var sAddress = (oRow.Address || "").trim();
                    if (sCode) { mCodes[sCode] = sName; }
                    if (sName) { mNames[sName] = sCode; }
                    if (sAddress) { mAddresses[sAddress] = true; }
                });

                oVhModel.setProperty("/siteCodeItems", Object.keys(mCodes).sort().map(function (sKey) {
                    return { key: sKey, text: sKey, additionalText: mCodes[sKey] || "" };
                }));
                oVhModel.setProperty("/siteNameItems", Object.keys(mNames).sort().map(function (sKey) {
                    return { key: sKey, text: sKey, additionalText: mNames[sKey] || "" };
                }));
                oVhModel.setProperty("/addressItems", Object.keys(mAddresses).sort().map(function (sKey) {
                    return { key: sKey, text: sKey };
                }));
            };

            var oCtx = this.getView().getBindingContext();
            var oProjectObj = oCtx && oCtx.getObject ? oCtx.getObject() : null;
            var aExpandedSites = oProjectObj && oProjectObj.ToSites && oProjectObj.ToSites.results ? oProjectObj.ToSites.results : null;
            if (Array.isArray(aExpandedSites) && aExpandedSites.length >= 0) {
                fnSetValueHelpItems(aExpandedSites);
                this._sSiteVhProjectId = this._sCurrentProjectId;
                if (fnDone) {
                    fnDone();
                }
                return;
            }

            oModel.read("/SiteSet", {
                filters: [new Filter("ProjectId", FilterOperator.EQ, this._sCurrentProjectId)],
                success: function (oData) {
                    var sCurrentPid = (this._sCurrentProjectId || "").toLowerCase();
                    var aResults = (oData && oData.results) ? oData.results : [];
                    var aScoped = aResults.filter(function (oRow) {
                        return ((oRow.ProjectId || "") + "").toLowerCase() === sCurrentPid;
                    });
                    fnSetValueHelpItems(aScoped);
                    this._sSiteVhProjectId = this._sCurrentProjectId;
                    if (fnDone) {
                        fnDone();
                    }
                }.bind(this),
                error: function () {
                    oVhModel.setProperty("/siteCodeItems", []);
                    oVhModel.setProperty("/siteNameItems", []);
                    oVhModel.setProperty("/addressItems", []);
                    if (fnDone) {
                        fnDone();
                    }
                }
            });
        },

        _openSiteValueHelpWithFreshData: function (mOptions) {
            if (!this._sCurrentProjectId) {
                return;
            }

            var oView = this.getView();
            if (oView) {
                oView.setBusyIndicatorDelay(0);
                oView.setBusy(true);
            }

            var fnReleaseBusy = function () {
                if (oView) {
                    oView.setBusy(false);
                }
            };

            if (this._sSiteVhProjectId === this._sCurrentProjectId) {
                try {
                    this._openSimpleSiteValueHelpDialog(mOptions);
                } finally {
                    fnReleaseBusy();
                }
                return;
            }

            this._loadSiteValueHelps(function () {
                try {
                    this._openSimpleSiteValueHelpDialog(mOptions);
                } finally {
                    fnReleaseBusy();
                }
            }.bind(this));
        },

        _warmUpSiteValueHelpDialogs: function () {
            [
                {
                    inputId: "fbSiteCode",
                    title: "Site Code",
                    itemsPath: "/siteCodeItems",
                    primaryLabel: "Site Code",
                    showSecondary: true,
                    secondaryLabel: "Site Name",
                    patternPlaceholder: "Nhập từ khóa"
                },
                {
                    inputId: "fbSiteName",
                    title: "Site Name",
                    itemsPath: "/siteNameItems",
                    primaryLabel: "Site Name",
                    showSecondary: true,
                    secondaryLabel: "Site Code",
                    patternPlaceholder: "Nhập từ khóa"
                },
                {
                    inputId: "fbSiteAddress",
                    title: "Address",
                    itemsPath: "/addressItems",
                    primaryLabel: "Address",
                    showSecondary: false,
                    secondaryLabel: "",
                    patternPlaceholder: "Nhập từ khóa"
                }
            ].forEach(function (mOptions) {
                this._getOrCreateSiteValueHelpDialog(mOptions);
            }.bind(this));
        },

        _getSiteValueHelpKey: function (mOptions) {
            return mOptions && mOptions.inputId;
        },

        _getOrCreateSiteValueHelpDialog: function (mOptions) {
            this._mSiteValueHelpCache = this._mSiteValueHelpCache || Object.create(null);

            var sKey = this._getSiteValueHelpKey(mOptions);
            var oCached = this._mSiteValueHelpCache[sKey];
            if (oCached) {
                return oCached;
            }

            var oTableModel = new JSONModel([]);
            var oPatternInput = new Input({ placeholder: mOptions.patternPlaceholder || "*text*" });

            var oCacheEntry = {
                options: mOptions,
                tableModel: oTableModel,
                allItems: []
            };

            var fnApplyPatternFilter = function (sPatternRaw) {
                var sNeedle = (sPatternRaw || "").trim().replace(/\*/g, "").toLowerCase();
                if (!sNeedle) {
                    oTableModel.setData(oCacheEntry.allItems);
                    return;
                }
                var aFiltered = oCacheEntry.allItems.filter(function (oItem) {
                    var sValue = (oItem.key || "").toString();
                    var sText = (oItem.text || "").toString();
                    return sValue.toLowerCase().indexOf(sNeedle) !== -1 || sText.toLowerCase().indexOf(sNeedle) !== -1;
                });
                oTableModel.setData(aFiltered);
            };

            var oDialog = new ValueHelpDialog({
                title: mOptions.title,
                key: "key",
                descriptionKey: "text",
                supportMultiselect: false,
                supportRanges: true,
                ok: function (oEvent) {
                    var aTokens = oEvent.getParameter("tokens") || [];
                    var oInput = this.byId(mOptions.inputId);
                    if (oInput) {
                        oInput.setValue(aTokens.length ? aTokens[0].getKey() : "");
                    }
                    oDialog.close();
                }.bind(this),
                cancel: function () { oDialog.close(); }
            });

            oDialog.setRangeKeyFields([{ label: mOptions.title, key: "key", type: "string" }]);

            var oInnerFilterBar = new FilterBar({
                useToolbar: true,
                showGoOnFB: true,
                search: function () {
                    fnApplyPatternFilter(oPatternInput.getValue());
                    oDialog.update();
                }
            });
            oInnerFilterBar.addFilterGroupItem(new FilterGroupItem({
                groupName: "Basic",
                name: "Contains",
                label: "Contains",
                visibleInFilterBar: true,
                control: oPatternInput
            }));
            oDialog.setFilterBar(oInnerFilterBar);

            oDialog.getTableAsync().then(function (oTable) {
                oTable.setModel(oTableModel);
                if (oTable.bindRows) {
                    oTable.addColumn(new UITableColumn({ label: new Label({ text: mOptions.primaryLabel }), template: new Text({ text: "{key}" }) }));
                    if (mOptions.showSecondary) {
                        oTable.addColumn(new UITableColumn({ label: new Label({ text: mOptions.secondaryLabel }), template: new Text({ text: "{additionalText}" }) }));
                    }
                    oTable.bindRows("/");
                } else {
                    oTable.addColumn(new MColumn({ header: new Label({ text: mOptions.primaryLabel }) }));
                    if (mOptions.showSecondary) {
                        oTable.addColumn(new MColumn({ header: new Label({ text: mOptions.secondaryLabel }) }));
                    }
                    var aCells = [new Text({ text: "{key}" })];
                    if (mOptions.showSecondary) {
                        aCells.push(new Text({ text: "{additionalText}" }));
                    }
                    oTable.bindItems("/", new ColumnListItem({ cells: aCells }));
                }
                oDialog.update();
            });

            oCacheEntry.dialog = oDialog;
            oCacheEntry.patternInput = oPatternInput;
            oCacheEntry.applyPatternFilter = fnApplyPatternFilter;
            this._mSiteValueHelpCache[sKey] = oCacheEntry;

            return oCacheEntry;
        },

        _openSimpleSiteValueHelpDialog: function (mOptions) {
            var oVhModel = this.getView().getModel("siteVh");
            var oInput = this.byId(mOptions.inputId);
            var oEntry = this._getOrCreateSiteValueHelpDialog(mOptions);
            var oDialog = oEntry.dialog;

            oEntry.allItems = (oVhModel && oVhModel.getProperty(mOptions.itemsPath)) || [];
            oEntry.tableModel.setData(oEntry.allItems);
            oEntry.patternInput.setValue("");

            var sCurrent = (oInput.getValue() || "").trim();
            if (sCurrent) {
                oDialog.setTokens([new Token({ key: sCurrent, text: sCurrent })]);
            } else {
                oDialog.setTokens([]);
            }

            oDialog.open();
        },

        onExit: function () {
            sap.ui.getCore().getEventBus().unsubscribe("Global", "RefreshData", this._onGlobalRefresh, this);
            var mCache = this._mSiteValueHelpCache || {};
            Object.keys(mCache).forEach(function (sKey) {
                var oEntry = mCache[sKey];
                if (oEntry && oEntry.dialog) {
                    oEntry.dialog.destroy();
                }
            });
            this._mSiteValueHelpCache = null;
        },

        _onGlobalRefresh: function () {
            if (!this._sCurrentProjectId) return;
            var oBinding = this.getView().getElementBinding();
            if (oBinding) { oBinding.refresh(true); }
        },

        onValueHelpSiteCodeRequest: function () {
            this._openSiteValueHelpWithFreshData({
                inputId: "fbSiteCode",
                title: "Site Code",
                itemsPath: "/siteCodeItems",
                primaryLabel: "Site Code",
                showSecondary: true,
                secondaryLabel: "Site Name",
                patternPlaceholder: "Nhập từ khóa"
            });
        },

        onValueHelpSiteNameRequest: function () {
            this._openSiteValueHelpWithFreshData({
                inputId: "fbSiteName",
                title: "Site Name",
                itemsPath: "/siteNameItems",
                primaryLabel: "Site Name",
                showSecondary: true,
                secondaryLabel: "Site Code",
                patternPlaceholder: "Nhập từ khóa"
            });
        },

        onValueHelpSiteAddressRequest: function () {
            this._openSiteValueHelpWithFreshData({
                inputId: "fbSiteAddress",
                title: "Address",
                itemsPath: "/addressItems",
                primaryLabel: "Address",
                showSecondary: false,
                secondaryLabel: "",
                patternPlaceholder: "Nhập từ khóa"
            });
        },

        onFilterSearch: function () {
            var sSiteCode = (this.byId("fbSiteCode").getValue() || "").trim();
            var sSiteName = (this.byId("fbSiteName").getValue() || "").trim();
            var sStatus = (this.byId("fbSiteStatus").getSelectedKey() || "").trim();
            var sAddress = (this.byId("fbSiteAddress").getValue() || "").trim();
            var oCreatedOn = this.byId("fbSiteCreatedOn").getDateValue();

            var sSiteCodeNeedle = this._normalizeCaseInsensitiveText(sSiteCode);
            var sSiteNameNeedle = this._normalizeCaseInsensitiveText(sSiteName);

            var aFilters = [];
            if (sSiteCode) {
                aFilters.push(new Filter({
                    path: "SiteCode",
                    test: function (vValue) {
                        return this._normalizeCaseInsensitiveText(vValue).indexOf(sSiteCodeNeedle) !== -1;
                    }.bind(this)
                }));
            }
            if (sSiteName) {
                aFilters.push(new Filter({
                    path: "SiteName",
                    test: function (vValue) {
                        return this._normalizeCaseInsensitiveText(vValue).indexOf(sSiteNameNeedle) !== -1;
                    }.bind(this)
                }));
            }
            if (sStatus) {
                aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
            }
            if (sAddress) {
                aFilters.push(new Filter("Address", FilterOperator.EQ, sAddress));
            }
            if (oCreatedOn) {
                var oStart = new Date(oCreatedOn.getFullYear(), oCreatedOn.getMonth(), oCreatedOn.getDate(), 0, 0, 0, 0);
                var oEnd = new Date(oCreatedOn.getFullYear(), oCreatedOn.getMonth(), oCreatedOn.getDate(), 23, 59, 59, 999);
                aFilters.push(new Filter("CreatedOn", FilterOperator.BT, oStart, oEnd));
            }

            var oBinding = this.byId("siteTable").getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        onFilterClear: function () {
            this.byId("fbSiteCode").setValue("");
            this.byId("fbSiteName").setValue("");
            this.byId("fbSiteStatus").setSelectedKey("");
            this.byId("fbSiteAddress").setValue("");
            this.byId("fbSiteCreatedOn").setValue("");
            this.onFilterSearch();
        },

        onSitePress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            if (!oCtx) return;
            this.getOwnerComponent().getRouter().navTo("SiteDetail", {
                site_id: oCtx.getProperty("SiteId")
            });
        },

        onPressSiteProgress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("projectSummaryModel");
            if (!oCtx) return;
            this.getOwnerComponent().getRouter().navTo("SiteDetail", {
                site_id: oCtx.getProperty("SiteId")
            });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
        },

        // ── APPROVERS ──────────────────────────────────────────────────────
        onEditApprovers: function () {
            var oView = this.getView();
            var oCtx = oView.getBindingContext();
            var sProjectId = oCtx.getProperty("ProjectId");
            var sProjectStatus = (oCtx.getProperty("Status") || "").toUpperCase();
            var oApproverModel = oView.getModel("approver");
            var oApproverData = oApproverModel.getData();
            var bExists = oApproverData._exists;
            var oBundle = oView.getModel("i18n").getResourceBundle();
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            // 0. Permission check: ZBT_APPROVERS — only AuthLevel 99 (System Admin)
            var oUserModel = oView.getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            if (iAuthLevel !== 99) {
                MessageBox.error(oBundle.getText("approverPermissionError"));
                return;
            }

            // 1. Check Project Status
            if (bExists && sProjectStatus === "CLOSED") {
                MessageBox.error(oBundle.getText("projectClosedError"));
                return;
            }

            var fnCreateSelect = function (sSelectedKey, iAuthLevel) {
                return new Select({
                    width: "100%",
                    selectedKey: sSelectedKey || "",
                    forceSelection: false,
                    items: {
                        path: "users>/items",
                        filters: [
                            new sap.ui.model.Filter("AuthLevel", sap.ui.model.FilterOperator.EQ, iAuthLevel),
                            new sap.ui.model.Filter("Status", sap.ui.model.FilterOperator.EQ, "ACTIVE")
                        ],
                        template: new Item({
                            key: "{users>UserId}",
                            text: "{users>UserName} ({users>UserId})"
                        }),
                        templateShareable: false
                    }
                });
            };

            var oSelect1 = fnCreateSelect(oApproverData.Approver1Id, 1);
            var oSelect2 = fnCreateSelect(oApproverData.Approver2Id, 2);
            var oSelect3 = fnCreateSelect(oApproverData.Approver3Id, 3);

            var oDialog = new Dialog({
                title: oBundle.getText("editApprovers") || "Cập nhật người phê duyệt",
                contentWidth: "450px",
                content: [
                    new SimpleForm({
                        editable: true,
                        layout: "ResponsiveGridLayout",
                        content: [
                            new Label({ text: oBundle.getText("approver1") || "Kỹ sư phụ trách", required: true }), oSelect1,
                            new Label({ text: oBundle.getText("approver2") || "Tư vấn giám sát", required: true }), oSelect2,
                            new Label({ text: oBundle.getText("approver3") || "Đại diện CĐT", required: true }), oSelect3
                        ]
                    })
                ],
                beginButton: new Button({
                    text: oBundle.getText("saveApprovers") || "Lưu thay đổi",
                    type: "Emphasized",
                    press: function () {
                        var sId1 = oSelect1.getSelectedKey();
                        var sId2 = oSelect2.getSelectedKey();
                        var sId3 = oSelect3.getSelectedKey();

                        if (!sProjectId) {
                            MessageBox.error("Lỗi mất đồng bộ: Mã dự án không được để trống.");
                            return;
                        }

                        // 2. Validation
                        var bValid = true;
                        if (!sId1) { oSelect1.setValueState("Error"); bValid = false; } else { oSelect1.setValueState("None"); }
                        if (!sId2) { oSelect2.setValueState("Error"); bValid = false; } else { oSelect2.setValueState("None"); }
                        if (!sId3) { oSelect3.setValueState("Error"); bValid = false; } else { oSelect3.setValueState("None"); }

                        if (!bValid) {
                            MessageBox.error(oBundle.getText("approverFieldsRequired") || "Vui lòng chọn đầy đủ người phê duyệt cho cả 3 cấp.");
                            return;
                        }

                        var oPayload = {
                            ProjectId: sProjectId,
                            Approver1Id: sId1,
                            Approver2Id: sId2,
                            Approver3Id: sId3
                        };

                        oDialog.setBusy(true);

                        if (bExists) {
                            oModel.update("/ApproverSet(guid'" + sProjectId + "')", oPayload, {
                                success: function () {
                                    MessageToast.show(oBundle.getText("approverUpdatedSuccess"));
                                    that._loadApproverData(sProjectId);
                                    oDialog.close();
                                },
                                error: function (e) {
                                    oDialog.setBusy(false);
                                    that._showError(e, "approverUpdateError");
                                }
                            });
                        } else {
                            oModel.create("/ApproverSet", oPayload, {
                                success: function () {
                                    MessageToast.show(oBundle.getText("approverUpdatedSuccess"));
                                    that._loadApproverData(sProjectId);
                                    oDialog.close();
                                },
                                error: function (e) {
                                    oDialog.setBusy(false);
                                    that._showError(e, "approverUpdateError");
                                }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: oBundle.getText("cancel"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            // IMPORTANT: Add dialog as dependent so it can access 'users' model from view
            oView.addDependent(oDialog);
            oDialog.open();
        },

        onAddSite: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oCtx = this.getView().getBindingContext();
            var sStatus = (oCtx ? oCtx.getProperty("Status") : "").toUpperCase();

            // 1. Check Status
            if (sStatus === "CLOSED") {
                MessageBox.error(oBundle.getText("projectClosedSiteError"));
                return;
            }

            // 2. Check Permission
            if (!this._checkSiteActionPermission()) {
                MessageBox.error(oBundle.getText("createSitePermissionError"));
                return;
            }
            this._openSiteDialog(null);
        },

        onEditSite: function (oEvent) {
            oEvent.cancelBubble && oEvent.cancelBubble();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            // 1. Check Project Status
            var oCtx = this.getView().getBindingContext();
            var sProjectStatus = (oCtx ? oCtx.getProperty("Status") : "").toUpperCase();

            if (sProjectStatus === "CLOSED") {
                MessageBox.error(oBundle.getText("projectClosedSiteError"));
                return;
            }

            // 2. Check Permission
            if (!this._checkSiteActionPermission()) {
                MessageBox.error(oBundle.getText("createSitePermissionError"));
                return;
            }

            var oContext = oEvent.getSource().getBindingContext();

            // 3. Check Site Status
            var sSiteStatus = (oContext.getProperty("Status") || "").toUpperCase();
            if (sSiteStatus === "CLOSED") {
                MessageBox.error("Không thể chỉnh sửa thông tin khi Công trường đã đóng.");
                return;
            }

            this._openSiteDialog(oContext);
        },

        onDeleteSite: function (oEvent) {
            oEvent.cancelBubble && oEvent.cancelBubble();
            var oContext = oEvent.getSource().getBindingContext();
            var sName = oContext.getProperty("SiteName");
            var sSiteId = oContext.getProperty("SiteId");
            var sPath = oContext.getPath();
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var oCtx = this.getView().getBindingContext();
            var sStatus = (oCtx ? oCtx.getProperty("Status") : "").toUpperCase();

            if (sStatus === "CLOSED") {
                MessageBox.error(oBundle.getText("projectClosedSiteError"));
                return;
            }

            if (!this._checkSiteActionPermission()) {
                MessageBox.error(oBundle.getText("createSitePermissionError"));
                return;
            }

            MessageBox.confirm(oBundle.getText("deleteSiteConfirm", [sName]), {
                title: oBundle.getText("confirmDelete"),
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        sap.ui.core.BusyIndicator.show(0);
                        oModel.read("/SiteSet(guid'" + sSiteId + "')/ToWbs", {
                            urlParameters: { "$top": 1, "$select": "WbsId" },
                            success: function (oData) {
                                if (oData.results && oData.results.length > 0) {
                                    sap.ui.core.BusyIndicator.hide();
                                    MessageBox.error("Không thể xóa vì đã có hạng mục công việc thuộc Công trường này.");
                                } else {
                                    oModel.remove(sPath, {
                                        success: function () {
                                            sap.ui.core.BusyIndicator.hide();
                                            MessageToast.show(oBundle.getText("siteDeletedSuccess"));
                                            that._refreshSiteAfterMutation();
                                        },
                                        error: function (oErr) {
                                            sap.ui.core.BusyIndicator.hide();
                                            var sMsg = oBundle.getText("siteDeleteError");
                                            try {
                                                var oResp = JSON.parse(oErr.responseText);
                                                if (oResp && oResp.error && oResp.error.message) {
                                                    sMsg = oResp.error.message.value || oResp.error.message;
                                                }
                                            } catch (e) {
                                                sMsg = oErr.message || sMsg;
                                            }
                                            MessageBox.error(sMsg);
                                        }
                                    });
                                }
                            },
                            error: function () {
                                sap.ui.core.BusyIndicator.hide();
                                MessageBox.error("Lỗi khi kiểm tra dữ liệu hạng mục liên kết.");
                            }
                        });
                    }
                }
            });
        },

        _refreshSiteAfterMutation: function () {
            this._sSiteVhProjectId = null;

            var oBinding = this.getView().getElementBinding();
            if (oBinding && oBinding.refresh) {
                oBinding.attachEventOnce("dataReceived", function () {
                    this._loadSiteValueHelps();
                }.bind(this));
                oBinding.refresh(true);
                return;
            }

            this._loadSiteValueHelps();
        },

        _checkSiteActionPermission: function () {
            var oUserModel = this.getView().getModel("userModel");
            if (!oUserModel) return false;

            var iAuthLevel = oUserModel.getProperty("/authLevel");

            // ZBT_SITE: AuthLevel 1 (Lead Engineer) or 99 (System Admin)
            if (iAuthLevel === 99 || iAuthLevel === 1) {
                return true;
            }

            return false;
        },

        _openSiteDialog: function (oContext) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            var oInputCode = new Input({
                placeholder: "e.g. SITE-001",
                visible: bEdit,
                editable: false,
                value: bEdit ? oContext.getProperty("SiteCode") : "",
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValue(oSource.getValue().toUpperCase());
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            var oInputName = new Input({
                placeholder: oBundle.getText("siteName"),
                maxLength: 100,
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            var oInputAddress = new Input({
                placeholder: oBundle.getText("address"),
                maxLength: 100,
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            if (bEdit) {
                oInputName.setValue(oContext.getProperty("SiteName"));
                oInputAddress.setValue(oContext.getProperty("Address"));
            }

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: oBundle.getText("siteCode"), required: true, visible: bEdit }), oInputCode,
                    new Label({ text: oBundle.getText("siteName"), required: true }), oInputName,
                    new Label({ text: oBundle.getText("address"), required: true }), oInputAddress
                ]
            });

            var oDialog = new Dialog({
                title: bEdit ? oBundle.getText("editSite") : oBundle.getText("addNewSite"),
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? oBundle.getText("saveChanges") : oBundle.getText("create"),
                    type: "Emphasized",
                    press: function () {
                        oInputCode.setValueState("None");
                        oInputCode.setValueStateText("");
                        oInputName.setValueState("None");
                        oInputName.setValueStateText("");
                        oInputAddress.setValueState("None");
                        oInputAddress.setValueStateText("");

                        var bHasError = false;
                        var sCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        var sAddress = oInputAddress.getValue().trim();

                        if (bEdit && !sCode) {
                            oInputCode.setValueState("Error");
                            oInputCode.setValueStateText(oBundle.getText("requireSiteCode"));
                            bHasError = true;
                        }

                        if (!sName) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("requireSiteName"));
                            bHasError = true;
                        } else if (sName.length > 100) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("maxLength100Error"));
                            bHasError = true;
                        }

                        if (!sAddress) {
                            oInputAddress.setValueState("Error");
                            oInputAddress.setValueStateText(oBundle.getText("requireAddress"));
                            bHasError = true;
                        } else if (sAddress.length > 100) {
                            oInputAddress.setValueState("Error");
                            oInputAddress.setValueStateText(oBundle.getText("maxLength100Error"));
                            bHasError = true;
                        }

                        if (bHasError) {
                            return;
                        }

                        // Duplicate Name Check (within the current project)
                        // Use the siteVh model which is already loaded with all sites for this project
                        var oVhModel = that.getView().getModel("siteVh");
                        var aSiteNames = (oVhModel && oVhModel.getProperty("/siteNameItems")) || [];
                        var bNameExists = aSiteNames.some(function (item) {
                            // item.key is the SiteName, item.additionalText is the SiteCode
                            return item.key.trim().toLowerCase() === sName.toLowerCase() && item.additionalText !== sCode;
                        });

                        if (bNameExists) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("siteNameExistsError"));
                            return;
                        }
                        var oPayload = {
                            SiteName: sName,
                            Address: oInputAddress.getValue().trim(),
                            Status: bEdit ? oContext.getProperty("Status") : "PLANNING"
                        };
                        if (bEdit) {
                            oPayload.SiteCode = sCode;
                        }
                        if (!bEdit) {
                            oPayload.ProjectId = that._sCurrentProjectId;
                        }
                        if (bEdit) {
                            oModel.update(oContext.getPath(), oPayload, {
                                success: function () {
                                    MessageToast.show(oBundle.getText("siteUpdatedSuccess"));
                                    that._refreshSiteAfterMutation();
                                    oDialog.close();
                                },
                                error: function (oError) { that._showError(oError, "siteUpdateError"); }
                            });
                        } else {
                            oModel.create("/SiteSet", oPayload, {
                                success: function () {
                                    MessageToast.show(oBundle.getText("siteCreatedSuccess"));
                                    that._refreshSiteAfterMutation();
                                    oDialog.close();
                                },
                                error: function (oError) { that._showError(oError, "siteCreateError"); }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: oBundle.getText("cancel"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.addStyleClass("sapUiContentPadding");
            oDialog.open();
        },

        onCloseSite: function (oEvent) {
            var oRow = oEvent.getSource().getParent(); // The HBox
            if (oRow.getMetadata().getName() === "sap.m.HBox") {
                oRow = oRow.getParent(); // The ColumnListItem
            }

            var oBindingCtx = oRow.getBindingContext();
            if (!oBindingCtx) return;

            var sSiteId = oBindingCtx.getProperty("SiteId");

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var that = this;

            MessageBox.confirm(oBundle.getText("closeConfirm"), {
                title: oBundle.getText("closeSite"),
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that.getView().setBusy(true);
                        var oModel = that.getOwnerComponent().getModel();
                        oModel.callFunction("/UpdateStatus", {
                            method: "POST",
                            urlParameters: {
                                ObjectType: 'SITE',
                                ObjectId: sSiteId,
                                NewStatus: 'CLOSED'
                            },
                            success: function (oData) {
                                that.getView().setBusy(false);
                                var oResult = oData.UpdateStatus || oData;
                                if (oResult && oResult.Success === false) {
                                    MessageBox.error(oResult.Message || oBundle.getText("closeError"));
                                } else {
                                    MessageToast.show(oBundle.getText("closeSuccess"));
                                    oModel.refresh(true, true);
                                }
                            },
                            error: function (oError) {
                                that.getView().setBusy(false);
                                that._showError(oError, "closeError");
                            }
                        });
                    }
                }
            });
        },

        _showError: function (oError, sDefaultI18nKey) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sMsg = sDefaultI18nKey ? (oBundle.getText(sDefaultI18nKey) || "Action failed.") : "System error occurred.";

            try {
                if (oError && oError.responseText) {
                    var oErr = JSON.parse(oError.responseText);
                    if (oErr.error && oErr.error.message && oErr.error.message.value) {
                        sMsg = oErr.error.message.value;
                    } else if (oErr.error && oErr.error.innererror && oErr.error.innererror.errordetails && oErr.error.innererror.errordetails.length > 0) {
                        sMsg = oErr.error.innererror.errordetails[0].message;
                    }
                } else if (oError && oError.message) {
                    sMsg = oError.message;
                }
            } catch (e) {
                // Keep default
            }

            MessageBox.error(sMsg);
        }
    });
});