sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, MessageToast, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.Dashboard", {

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
                weatherWind: "--"
            });
            this.getView().setModel(oDashboardModel, "dashboard");

            this.getOwnerComponent().getRouter()
                .getRoute("Dashboard")
                .attachPatternMatched(this._onDashboardMatched, this);
        },

        onAfterRendering: function () {
            // Attach click events to clickable cards
            var that = this;
            var aCardActions = [
                { id: "cardMyProjects", fn: "onGoToProjects" },
                { id: "cardProjectSites", fn: "onGoToProjects" }
            ];
            aCardActions.forEach(function (cfg) {
                var oCard = that.byId(cfg.id);
                if (oCard && oCard.getDomRef()) {
                    oCard.getDomRef().addEventListener("click", function (e) {
                        // Don't navigate if clicking a button inside the card
                        if (e.target.closest(".sapMBtn")) { return; }
                        that[cfg.fn]();
                    });
                }
            });
        },

        _onDashboardMatched: function () {
            this._loadStats();
            this._loadWeather();
        },

        // ── OData stats ────────────────────────────────────────────────────
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

        // ── Weather API (OpenWeatherMap - free tier) ────────────────────────
        _loadWeather: function () {
            var oDash = this.getView().getModel("dashboard");

            // Use browser geolocation, fallback to Ho Chi Minh City
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        this._fetchWeather(pos.coords.latitude, pos.coords.longitude, oDash);
                    }.bind(this),
                    function () {
                        // Geolocation denied → default to HCMC
                        this._fetchWeather(10.8231, 106.6297, oDash);
                    }.bind(this),
                    { timeout: 5000 }
                );
            } else {
                this._fetchWeather(10.8231, 106.6297, oDash);
            }
        },

        _fetchWeather: function (lat, lon, oDash) {
            // Open-Meteo API — free, no API key, CORS enabled
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
                        var iCode = cur.weather_code || 0;

                        // Map WMO weather code to description + icon
                        var oWeather = that._mapWeatherCode(iCode);

                        oDash.setProperty("/weatherTemp", Math.round(cur.temperature_2m) + "°C");
                        oDash.setProperty("/weatherDesc", oWeather.desc);
                        oDash.setProperty("/weatherIcon", oWeather.icon);
                        oDash.setProperty("/weatherHumidity", cur.relative_humidity_2m || "--");
                        oDash.setProperty("/weatherWind", Math.round(cur.wind_speed_10m) || "--");
                    }
                })
                .catch(function () {
                    oDash.setProperty("/weatherTemp", "--°C");
                    oDash.setProperty("/weatherDesc", "Unavailable");
                });

            // Reverse geocoding for city name (Nominatim / OpenStreetMap — free)
            fetch("https://nominatim.openstreetmap.org/reverse?lat=" + lat
                + "&lon=" + lon + "&format=json&accept-language=vi")
                .then(function (res) { return res.json(); })
                .then(function (geo) {
                    if (geo && geo.address) {
                        var sCity = geo.address.city || geo.address.town
                            || geo.address.county || geo.address.state || "";
                        var sDistrict = geo.address.suburb || geo.address.district || "";
                        var sDisplay = sDistrict ? (sDistrict + ", " + sCity) : sCity;
                        oDash.setProperty("/weatherCity", sDisplay);
                    }
                })
                .catch(function () { });
        },

        /**
         * Map WMO Weather Code to Vietnamese description + SAP icon.
         */
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
            MessageToast.show("Feature under development", {
                duration: 3000,
                width: "20em",
                at: "center bottom"
            });
        }
    });
});
