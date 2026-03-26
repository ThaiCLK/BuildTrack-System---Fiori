sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/base/strings/formatMessage"
], function (Controller, JSONModel, MessageToast, Filter, FilterOperator, formatMessage) {
    "use strict";

    // ── SAP Fiori chart color palette ──────────────────────────────────────
    var SAP_COLORS = ["#5899DA", "#E8743B", "#19A979", "#ED4A7B", "#945ECF", "#13A4B4", "#525DF4", "#BF399E"];

    return Controller.extend("z.bts.buildtrack551.controller.Dashboard", {

        // ── onInit ─────────────────────────────────────────────────────────
        onInit: function () {
            var oDashboardModel = new JSONModel({
                planningProjects: 0,
                pendingApprovals: 0,
                budgetSpentPct: 85,
                criticalResources: 2,
                totalSites: 0,
                planningSites: 0,
                // Weather
                weatherTemp: "--°C",
                weatherDesc: "Loading...",
                weatherCity: "",
                weatherIcon: "sap-icon://weather-proofing",
                weatherHumidity: "--",
                weatherWind: "--",
                // Filter
                projects: [],
                selectedProject: null,
                // Charts
                wbsStatusChart: [],
                wbsPerSiteChart: [],
                dailyOutputChart: [],
                wbsProgressChart: []
            });
            this.getView().setModel(oDashboardModel, "dashboard");

            // Cached OData data (loaded once)
            this._allProjects = [];
            this._allSites = [];
            this._allWbs = [];
            this._allLogs = [];

            this.getOwnerComponent().getRouter()
                .getRoute("Dashboard")
                .attachPatternMatched(this._onDashboardMatched, this);
        },

        // ── onAfterRendering ───────────────────────────────────────────────
        onAfterRendering: function () {
            var that = this;
            // Apply SAP Fiori color palette to VizFrame charts after render
            var aChartIds = ["chartWbsStatus", "chartWbsPerSite", "chartDailyOutput", "chartWbsProgress"];
            aChartIds.forEach(function (sId) {
                var oViz = that.byId(sId);
                if (oViz) {
                    oViz.setVizProperties({
                        plotArea: {
                            colorPalette: SAP_COLORS,
                            dataLabel: { visible: false }
                        },
                        legend: { visible: true },
                        interaction: { selectability: { mode: "EXCLUSIVE" } }
                    });
                }
            });

            // Card click events
            var aCardActions = [
                { id: "cardMyProjects", fn: "onGoToProjects" },
                { id: "cardProjectSites", fn: "onGoToProjects" }
            ];
            aCardActions.forEach(function (cfg) {
                var oCard = that.byId(cfg.id);
                if (oCard && oCard.getDomRef()) {
                    oCard.getDomRef().addEventListener("click", function (e) {
                        if (e.target.closest(".sapMBtn")) { return; }
                        that[cfg.fn]();
                    });
                }
            });
        },

        // ── Route matched ──────────────────────────────────────────────────
        _onDashboardMatched: function () {
            this._loadStats();
            this._loadWeather();
            this._loadAnalyticsData();
        },

        // ── KPI Stats ──────────────────────────────────────────────────────
        _loadStats: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oDash = this.getView().getModel("dashboard");

            oModel.read("/ProjectSet", {
                success: function (oData) {
                    var aProj = oData.results || [];
                    var iPending = aProj.filter(function (p) {
                        return (p.Status || "").toUpperCase() === "PLANNING";
                    }).length;
                    oDash.setProperty("/planningProjects", iPending);
                    oDash.setProperty("/pendingApprovals", iPending);
                },
                error: function () { }
            });

            oModel.read("/SiteSet", {
                success: function (oData) {
                    var aSites = oData.results || [];
                    var iPlanning = aSites.filter(function (s) {
                        return (s.Status || "").toUpperCase() === "PLANNING";
                    }).length;
                    oDash.setProperty("/totalSites", aSites.length);
                    oDash.setProperty("/planningSites", iPlanning);
                },
                error: function () { }
            });
        },

        // ── Load all analytics data once ───────────────────────────────────
        _loadAnalyticsData: function () {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var oDash = this.getView().getModel("dashboard");

            // 1. Projects → populate ComboBox
            oModel.read("/ProjectSet", {
                success: function (oData) {
                    that._allProjects = oData.results || [];
                    var aItems = that._allProjects.map(function (p) {
                        return { ProjectId: p.ProjectId, ProjectName: p.ProjectName || p.ProjectCode || p.ProjectId };
                    });
                    oDash.setProperty("/projects", aItems);
                    that._checkAndBuildCharts();
                },
                error: function () { }
            });

            // 2. Sites
            oModel.read("/SiteSet", {
                success: function (oData) {
                    that._allSites = oData.results || [];
                    that._checkAndBuildCharts();
                },
                error: function () { }
            });

            // 3. WBS -> status map, etc.
            oModel.read("/WBSSet", {
                success: function (oData) {
                    that._allWbs = oData.results || [];

                    // Populate WBS Unit Filter
                    var aUnits = [];
                    var oUnitMap = {};
                    that._allWbs.forEach(function (w) {
                        var u = w.UnitCode;
                        if (u && u.trim() !== "" && !oUnitMap[u]) {
                            oUnitMap[u] = true;
                            aUnits.push({ Unit: u, DisplayText: u });
                        }
                    });
                    aUnits.sort(function (a, b) { return a.Unit.localeCompare(b.Unit); });
                    aUnits.unshift({ Unit: "ALL", DisplayText: that.getView().getModel("i18n").getResourceBundle().getText("dashboardAllUnits") });
                    oDash.setProperty("/wbsUnitList", aUnits);

                    that._checkAndBuildCharts();
                },
                error: function () { }
            });

            // 4. DailyLog
            oModel.read("/DailyLogSet", {
                success: function (oData) {
                    that._allLogs = oData.results || [];
                    that._checkAndBuildCharts();
                },
                error: function () { }
            });
        },

        // Wait until all 4 entity sets are loaded before building charts
        _checkAndBuildCharts: function () {
            if (this._allProjects.length >= 0 &&
                this._allSites.length >= 0 &&
                this._allWbs.length >= 0 &&
                this._allLogs.length >= 0) {
                this._buildCharts(null);
            }
        },

        // ── Build / rebuild all chart data ─────────────────────────────────
        _buildCharts: function (sProjectId) {
            var oDash = this.getView().getModel("dashboard");

            // ── COMPUTE WBS PROGRESS MANUALLY FROM LOGS ────────────────
            if (this._allWbs && this._allLogs) {
                this._allWbs.forEach(function (w) {
                    var sumDone = 0;
                    this._allLogs.forEach(function (log) {
                        if (log.WbsId === w.WbsId) {
                            sumDone += parseFloat(log.QuantityDone || 0);
                        }
                    });
                    w.TotalQuantityDone = sumDone;
                }.bind(this));
            }

            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            var formatStatus = function (s) {
                var m = {
                    "PLANNING": oBundle.getText("planning"),
                    "OPENED": oBundle.getText("opened"),
                    "IN_PROGRESS": oBundle.getText("inProgress"),
                    "CLOSED": oBundle.getText("closed"),
                    "REJECTED": oBundle.getText("rejected")
                };
                return m[s] || s;
            };

            var aStatusOrder = [
                oBundle.getText("planning"),
                oBundle.getText("opened"),
                oBundle.getText("inProgress"),
                oBundle.getText("closed"),
                oBundle.getText("rejected")
            ];

            // Filter sites by project
            var aFilteredSites = sProjectId
                ? this._allSites.filter(function (s) { return s.ProjectId === sProjectId; })
                : this._allSites;

            var aFilteredSiteIds = aFilteredSites.map(function (s) { return s.SiteId; });

            // Filter WBS by those sites
            var aFilteredWbs = this._allWbs.filter(function (w) {
                return !sProjectId || aFilteredSiteIds.indexOf(w.SiteId) !== -1;
            });

            // Filter logs by WBS
            var aFilteredWbsIds = aFilteredWbs.map(function (w) { return w.WbsId; });
            var aFilteredLogs = this._allLogs.filter(function (l) {
                return !sProjectId || aFilteredWbsIds.indexOf(l.WbsId) !== -1;
            });

            // ── Chart 1: WBS Status (Donut) ──────────────────────────────
            var oStatusMap = {};
            aFilteredWbs.forEach(function (w) {
                var sRawStatus = w.Status || "Unknown";
                if (sRawStatus === "PENDING_OPEN" || sRawStatus === "PENDING_CLOSE") return;
                var sStatus = formatStatus(sRawStatus);
                oStatusMap[sStatus] = (oStatusMap[sStatus] || 0) + 1;
            });
            var aStatusChart = Object.keys(oStatusMap).map(function (s) {
                return { status: s, count: oStatusMap[s] };
            });
            aStatusChart.sort(function (a, b) {
                var idxA = aStatusOrder.indexOf(a.status);
                var idxB = aStatusOrder.indexOf(b.status);
                return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
            });
            oDash.setProperty("/wbsStatusChart", aStatusChart);

            // ── Chart 2: WBS per Site (Stacked Bar) ──────────────────────
            var oSiteStatusMap = {}; // { siteId: { siteName, statusMap } }
            var oSiteById = {};
            aFilteredSites.forEach(function (s) { oSiteById[s.SiteId] = s.SiteName || s.SiteCode || s.SiteId; });

            aFilteredWbs.forEach(function (w) {
                var sRawStatus = w.Status || "Unknown";
                if (sRawStatus === "PENDING_OPEN" || sRawStatus === "PENDING_CLOSE") return;
                var sSiteName = oSiteById[w.SiteId] || "Unknown";
                var sStatus = formatStatus(sRawStatus);
                if (!oSiteStatusMap[sSiteName]) { oSiteStatusMap[sSiteName] = {}; }
                oSiteStatusMap[sSiteName][sStatus] = (oSiteStatusMap[sSiteName][sStatus] || 0) + 1;
            });

            var aPerSiteFlat = [];
            Object.keys(oSiteStatusMap).forEach(function (sSite) {
                aStatusOrder.forEach(function (sStatus) {
                    if (oSiteStatusMap[sSite][sStatus] !== undefined) {
                        aPerSiteFlat.push({ site: sSite, status: sStatus, count: oSiteStatusMap[sSite][sStatus] });
                    }
                });
                Object.keys(oSiteStatusMap[sSite]).forEach(function (s) {
                    if (aStatusOrder.indexOf(s) === -1) {
                        aPerSiteFlat.push({ site: sSite, status: s, count: oSiteStatusMap[sSite][s] });
                    }
                });
            });
            oDash.setProperty("/wbsPerSiteChart", aPerSiteFlat);

            // ── Chart 3: Daily Output Line Chart (last 14 days) ───────────
            var oCutoff = new Date();
            oCutoff.setDate(oCutoff.getDate() - 14);
            var oDayMap = {};

            aFilteredLogs.forEach(function (l) {
                if (!l.LogDate) { return; }
                // OData DateTime: "/Date(ms)/"
                var ms = typeof l.LogDate === "object" ? l.LogDate.getTime() : parseInt((l.LogDate + "").replace(/[^0-9]/g, ""), 10);
                var oDate = new Date(ms);
                if (oDate < oCutoff) { return; }
                var sDay = oDate.getDate().toString().padStart(2, "0") + "/" +
                    (oDate.getMonth() + 1).toString().padStart(2, "0");
                var fQty = parseFloat(l.QuantityDone) || 0;
                oDayMap[sDay] = (oDayMap[sDay] || 0) + fQty;
            });

            // Sort by date
            var aDailyChart = Object.keys(oDayMap).sort().map(function (d) {
                return { date: d, quantity: Math.round(oDayMap[d] * 100) / 100 };
            });
            // If no log data, show a friendly empty message placeholder
            if (aDailyChart.length === 0) {
                aDailyChart = [{ date: "---", quantity: 0 }];
            }
            oDash.setProperty("/dailyOutputChart", aDailyChart);

            // ── Chart 4: Top WBS Progress (Stacked Done vs Remaining) ─────
            var sUnit = this.byId("cbWbsUnit") ? this.byId("cbWbsUnit").getSelectedKey() : "ALL";
            if (!sUnit) sUnit = "ALL";

            // Only leaf WBS with Quantity > 0 and TotalQuantityDone > 0, matching Unit, top 10
            var aLeafWbs = aFilteredWbs.filter(function (w) {
                var bHasQuantity = parseFloat(w.Quantity) > 0 && parseFloat(w.TotalQuantityDone) > 0;
                var bMatchUnit = (sUnit === "ALL") || (w.UnitCode === sUnit);
                return bHasQuantity && bMatchUnit;
            });
            aLeafWbs.sort(function (a, b) { return parseFloat(b.Quantity) - parseFloat(a.Quantity); });
            var aTopWbs = aLeafWbs.slice(0, 10);

            var aProgressChart = [];
            aTopWbs.forEach(function (w) {
                var fTotal = parseFloat(w.Quantity) || 0;
                var fDone = Math.min(parseFloat(w.TotalQuantityDone) || 0, fTotal);
                var fRem = Math.max(fTotal - fDone, 0);

                // Ensure full name to prevent category grouping issues in VizFrame
                var sName = w.WbsName || w.WbsCode || "WBS";

                aProgressChart.push({ wbsName: sName, type: oBundle.getText("done"), value: Math.round(fDone * 100) / 100 });
                aProgressChart.push({ wbsName: sName, type: oBundle.getText("remaining"), value: Math.round(fRem * 100) / 100 });
            });
            if (aProgressChart.length === 0) {
                aProgressChart = [{ wbsName: "No Data", type: "Done", value: 0 }];
            }
            oDash.setProperty("/wbsProgressChart", aProgressChart);

            // Re-apply chart properties after data update
            this._applyVizProperties();
        },

        // ── Apply VizFrame visual properties ──────────────────────────────
        _applyVizProperties: function () {
            var that = this;

            // Donut
            var oDonut = that.byId("chartWbsStatus");
            if (oDonut) {
                oDonut.setVizProperties({
                    plotArea: { colorPalette: SAP_COLORS, dataLabel: { visible: true, type: "percentage" } },
                    title: { visible: false },
                    legend: { visible: true, title: { visible: false } }
                });
            }

            // Stacked Bar: WBS per Site
            var oStackedSite = that.byId("chartWbsPerSite");
            if (oStackedSite) {
                oStackedSite.setVizProperties({
                    plotArea: { colorPalette: SAP_COLORS, dataLabel: { visible: false } },
                    title: { visible: false },
                    legend: { visible: true, title: { visible: false } },
                    categoryAxis: { title: { visible: false } },
                    valueAxis: { title: { visible: false } }
                });
            }

            // Line: Daily Output
            var oLine = that.byId("chartDailyOutput");
            if (oLine) {
                oLine.setVizProperties({
                    plotArea: {
                        colorPalette: ["#5899DA"],
                        dataLabel: { visible: false },
                        dataPoint: { stroke: { color: "#5899DA" } },
                        marker: { visible: true, size: 6 },
                        line: { width: 2 }
                    },
                    title: { visible: false },
                    legend: { visible: false },
                    categoryAxis: { title: { visible: false } },
                    valueAxis: { title: { text: "Qty" } }
                });
            }

            // Stacked Bar: WBS Progress
            var oProgress = that.byId("chartWbsProgress");
            if (oProgress) {
                oProgress.setVizProperties({
                    plotArea: {
                        colorPalette: ["#19A979", "#E0E0E0"],
                        dataLabel: { visible: false }
                    },
                    title: { visible: false },
                    legend: { visible: true, title: { visible: false } },
                    categoryAxis: { title: { visible: false }, label: { truncation: { enabled: false } } },
                    valueAxis: { title: { visible: false } }
                });
            }
        },

        // ── Filter handlers ────────────────────────────────────────────────
        onFilterChange: function (oEvent) {
            var oCombo = this.byId("cbProject");
            var sKey = oCombo ? oCombo.getSelectedKey() : null;
            this._buildCharts(sKey || null);
        },

        onResetFilter: function () {
            var oCombo = this.byId("cbProject");
            if (oCombo) { oCombo.setSelectedKey(""); }
            this._buildCharts(null);
        },

        // ── Weather API (OpenWeatherMap - free tier) ────────────────────────
        _loadWeather: function () {
            var oDash = this.getView().getModel("dashboard");
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        this._fetchWeather(pos.coords.latitude, pos.coords.longitude, oDash);
                    }.bind(this),
                    function () {
                        this._fetchWeather(10.8231, 106.6297, oDash);
                    }.bind(this),
                    { timeout: 5000 }
                );
            } else {
                this._fetchWeather(10.8231, 106.6297, oDash);
            }
        },

        _fetchWeather: function (lat, lon, oDash) {
            var sUrl = "https://api.open-meteo.com/v1/forecast"
                + "?latitude=" + lat + "&longitude=" + lon
                + "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
                + "&timezone=auto";

            var that = this;
            fetch(sUrl)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data && data.current) {
                        var cur = data.current;
                        var oWth = that._mapWeatherCode(cur.weather_code || 0);
                        oDash.setProperty("/weatherTemp", Math.round(cur.temperature_2m) + "°C");
                        oDash.setProperty("/weatherDesc", oWth.desc);
                        oDash.setProperty("/weatherIcon", oWth.icon);
                        oDash.setProperty("/weatherHumidity", cur.relative_humidity_2m || "--");
                        oDash.setProperty("/weatherWind", Math.round(cur.wind_speed_10m) || "--");
                    }
                })
                .catch(function () {
                    oDash.setProperty("/weatherTemp", "--°C");
                    oDash.setProperty("/weatherDesc", "Unavailable");
                });

            fetch("https://nominatim.openstreetmap.org/reverse?lat=" + lat
                + "&lon=" + lon + "&format=json&accept-language=vi")
                .then(function (res) { return res.json(); })
                .then(function (geo) {
                    if (geo && geo.address) {
                        var sCity = geo.address.city || geo.address.town || geo.address.county || geo.address.state || "";
                        var sDistrict = geo.address.suburb || geo.address.district || "";
                        oDash.setProperty("/weatherCity", sDistrict ? (sDistrict + ", " + sCity) : sCity);
                    }
                })
                .catch(function () { });
        },

        _mapWeatherCode: function (code) {
            var map = {
                0: { desc: "Trời quang", icon: "sap-icon://weather-proofing" },
                1: { desc: "Gần quang", icon: "sap-icon://weather-proofing" },
                2: { desc: "Có mây rải rác", icon: "sap-icon://cloud" },
                3: { desc: "Nhiều mây", icon: "sap-icon://cloud" },
                45: { desc: "Sương mù", icon: "sap-icon://blur" },
                48: { desc: "Sương mù đóng băng", icon: "sap-icon://blur" },
                51: { desc: "Mưa phùn nhẹ", icon: "sap-icon://umbrella" },
                53: { desc: "Mưa phùn vừa", icon: "sap-icon://umbrella" },
                55: { desc: "Mưa phùn dày", icon: "sap-icon://umbrella" },
                61: { desc: "Mưa nhẹ", icon: "sap-icon://umbrella" },
                63: { desc: "Mưa vừa", icon: "sap-icon://umbrella" },
                65: { desc: "Mưa to", icon: "sap-icon://umbrella" },
                71: { desc: "Tuyết nhẹ", icon: "sap-icon://temperature" },
                73: { desc: "Tuyết vừa", icon: "sap-icon://temperature" },
                75: { desc: "Tuyết dày", icon: "sap-icon://temperature" },
                80: { desc: "Mưa rào nhẹ", icon: "sap-icon://umbrella" },
                81: { desc: "Mưa rào vừa", icon: "sap-icon://umbrella" },
                82: { desc: "Mưa rào to", icon: "sap-icon://umbrella" },
                95: { desc: "Giông bão", icon: "sap-icon://alert" },
                96: { desc: "Giông kèm mưa đá", icon: "sap-icon://alert" },
                99: { desc: "Giông mưa đá to", icon: "sap-icon://alert" }
            };
            return map[code] || { desc: "WMO " + code, icon: "sap-icon://weather-proofing" };
        },

        // ── Navigation ────────────────────────────────────────────────────
        onGoToProjects: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain");
        },

        onFeatureUnderdevelopment: function () {
            MessageToast.show("Feature under development", { duration: 3000, width: "20em", at: "center bottom" });
        },

        // ── Formatters ────────────────────────────────────────────────────
        formatMessage: function (sPattern) {
            if (!sPattern) { return ""; }
            var aArgs = Array.prototype.slice.call(arguments, 1);
            return formatMessage(sPattern, aArgs);
        }
    });
});
