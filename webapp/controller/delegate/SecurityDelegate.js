sap.ui.define([
    "sap/ui/base/ManagedObject",
    "sap/ui/model/json/JSONModel"
], function (ManagedObject, JSONModel) {
    "use strict";

    return ManagedObject.extend("z.bts.buildtrack.controller.delegate.SecurityDelegate", {

        /**
         * Initializes the global user model and attempts to identify the current user.
         */
        initialize: function (oComponent) {
            var oUserModel = new JSONModel({
                userId: "",
                userName: "Identifying...",
                email: "",
                avatarUrl: "",
                role: "",
                authLevel: 0,
                isLoaded: false
            });
            oComponent.setModel(oUserModel, "userModel");

            this._oModel = oComponent.getModel();
            this._oUserModel = oUserModel;
            
            // Promise for delegates to wait on
            this._oIdentityPromise = new Promise(function(resolve) {
                this._resolveIdentity = resolve;
            }.bind(this));

            console.log("SecurityDelegate: Initializing with 'ME' probe...");

            // 1. PRIMARY DISCOVERY: The new 'ME' endpoint provided by BE
            this._oModel.read("/UserRoleSet('ME')", {
                success: function (oData) {
                    console.log("SecurityDelegate: 'ME' Identity Discovery successful!", oData.UserId);
                    this._updateIdentity(oData);
                }.bind(this),
                error: function () {
                    console.log("SecurityDelegate: 'ME' probe failed. Falling back to heuristics.");
                    this._runHeuristicDiscovery();
                }.bind(this)
            });
        },

        /**
         * Returns a promise that resolves when the user has been identified.
         */
        whenUserIdentified: function() {
            return this._oIdentityPromise;
        },

        /**
         * Runs secondary discovery methods if 'ME' fails (e.g. Shell, Cookies, Sniffer)
         */
        _runHeuristicDiscovery: function() {
            // Shell
            if (window.sap && sap.ushell && sap.ushell.Container) {
                sap.ushell.Container.getServiceAsync("UserInfo").then(function (oUserInfo) {
                    var sShellId = oUserInfo.getUser().getId();
                    if (sShellId && sShellId !== "DEFAULT_USER" && sShellId !== "ANONYMOUS") {
                        this.identifyUser(sShellId);
                    }
                }.bind(this)).catch(function(){});
            }

            // Sniffer for any subsequent OData traffic
            this._oModel.attachRequestCompleted(function (oEvent) {
                if (this._oUserModel.getProperty("/isLoaded")) return;
                var oResponse = oEvent.getParameter("response");
                if (oResponse && oResponse.headers) {
                    var sUser = oResponse.headers["sap-user"] || oResponse.headers["SAP-USER"];
                    if (sUser) this.identifyUser(sUser.toUpperCase());
                }
            }.bind(this));

            this.identifyUser();
        },

        /**
         * Public API to explicitly set or refresh identity.
         */
        identifyUser: function (sExplicitId) {
            var sCurrentId = this._oUserModel.getProperty("/userId");
            var sNewId = sExplicitId || this._internalGetIdFromCookies();
            
            sNewId = (sNewId || "").trim().toUpperCase();
            if (sNewId === "DEFAULT_USER" || sNewId === "ANONYMOUS") sNewId = "";

            if (!sNewId) return;

            if (sNewId !== sCurrentId) {
                this._loadUserProfile(sNewId);
            }
        },

        _internalGetIdFromCookies: function() {
            var sCookie = document.cookie || "";
            var m1 = sCookie.match(/sap-user=([^;]+)/i);
            var m2 = sCookie.match(/sap-usercontext=[^;]*sap-user=([^&;]+)/i);
            var sId = (m1 && m1[1]) || (m2 && m2[1]) || "";
            
            if (!sId) {
                var oParams = new URLSearchParams(window.location.search);
                sId = oParams.get("sap-user") || oParams.get("bt-user") || "";
            }
            return sId;
        },

        _loadUserProfile: function (sUserId) {
            var that = this;
            if (this._sActiveLoadingId === sUserId) return;
            this._sActiveLoadingId = sUserId;

            this._oModel.read("/UserRoleSet('" + sUserId + "')", {
                success: function (oData) {
                    that._updateIdentity(oData);
                    that._sActiveLoadingId = null;
                },
                error: function () {
                    console.error("SecurityDelegate: Identity Profile not found for:", sUserId);
                    that._oUserModel.setProperty("/userId", sUserId);
                    that._oUserModel.setProperty("/userName", sUserId);
                    that._oUserModel.setProperty("/isLoaded", true);
                    that._resolveIdentity(sUserId);
                    that._sActiveLoadingId = null;
                }
            });
        },

        _updateIdentity: function(oData) {
            this._oUserModel.setData({
                userId: oData.UserId,
                userName: oData.UserName,
                email: oData.Email,
                avatarUrl: oData.AvatarUrl,
                role: oData.Role,
                authLevel: oData.AuthLevel,
                isLoaded: true
            });
            this._resolveIdentity(oData.UserId);
        }
    });
});
