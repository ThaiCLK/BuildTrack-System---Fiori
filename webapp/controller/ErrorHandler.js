sap.ui.define([
    "sap/ui/base/Object",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (UI5Object, MessageBox, MessageToast) {
    "use strict";

    return UI5Object.extend("z.bts.buildtrack551.controller.ErrorHandler", {

        /**
         * Handles application errors by automatically attaching to the model events and displaying errors.
         * @class
         * @param {sap.ui.core.UIComponent} oComponent reference to the app's component
         */
        constructor: function (oComponent) {
            this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
            this._oComponent = oComponent;
            this._oModel = oComponent.getModel();
            this._bMessageOpen = false;
            this._sErrorText = this._oResourceBundle.getText("errorText") || "Sorry, a technical error occurred! Please try again later.";
            this._iPingInterval = 5000; // Ping every 5 seconds
            this._bIsReconnecting = false;
            this._oReconnectTimer = null;

            this._oModel.attachMetadataFailed(function (oEvent) {
                var oParams = oEvent.getParameters();
                this._showServiceError(oParams.response);
                this._startReconnectPing();
            }, this);

            this._oModel.attachRequestFailed(function (oEvent) {
                var oParams = oEvent.getParameters();
                // An entity that was not found in the service is also throwing a 404 error in oData.
                // We already cover this case with a notFound target so we skip it here.
                // A request that cannot be sent to the server is a technical error that we have to handle though
                if (oParams.response.statusCode !== "404" || (oParams.response.statusCode === 404 && oParams.response.responseText.indexOf("Cannot POST") === 0)) {
                    this._showServiceError(oParams.response);

                    // If connection failed (status 0, 502, 503, 504), start auto-reconnect
                    var sStatus = oParams.response.statusCode.toString();
                    if (sStatus === "0" || sStatus === "502" || sStatus === "503" || sStatus === "504") {
                        this._startReconnectPing();
                    }
                }
            }, this);
        },

        /**
         * Starts a background pinger to check when the server is back online
         */
        _startReconnectPing: function () {
            if (this._bIsReconnecting) {
                return;
            }
            this._bIsReconnecting = true;
            MessageToast.show("Connection lost. Trying to reconnect...");

            var pingAndCheck = function () {
                var sUrl = this._oModel.sServiceUrl + "/$metadata";

                $.ajax({
                    url: sUrl,
                    type: "HEAD",
                    timeout: 3000,
                    success: function () {
                        // Server is back!
                        this._stopReconnectPing();
                        this._bMessageOpen = false;
                        MessageToast.show("Connection restored! Refreshing data...");

                        // Force a full page reload so the data refreshes completely
                        setTimeout(function () {
                            window.location.reload();
                        }, 1000); // 1-second delay so the user can read the Toast message
                    }.bind(this),
                    error: function () {
                        // Still offline, schedule next ping
                        this._oReconnectTimer = setTimeout(pingAndCheck, this._iPingInterval);
                    }.bind(this)
                });
            }.bind(this);

            pingAndCheck();
        },

        /**
         * Stops the background pinger
         */
        _stopReconnectPing: function () {
            this._bIsReconnecting = false;
            if (this._oReconnectTimer) {
                clearTimeout(this._oReconnectTimer);
                this._oReconnectTimer = null;
            }
        },

        /**
         * Shows a {@link sap.m.MessageBox} when a service call has failed.
         * Only the first error message will be display.
         * @param {string} sDetails a technical error to be displayed on request
         * @private
         */
        _showServiceError: function (sDetails) {
            if (this._bMessageOpen) {
                return;
            }
            this._bMessageOpen = true;
            MessageToast.show(this._sErrorText);
            // Optionally, we could show a MessageBox here, but MessageToast is less intrusive during reconnect loops
            setTimeout(function () {
                this._bMessageOpen = false;
            }.bind(this), 3000);
        }
    });
});
