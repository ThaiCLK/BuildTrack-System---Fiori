sap.ui.define([
    "sap/ui/core/UIComponent",
    "z/bts/buildtrack551/model/models",
    "z/bts/buildtrack551/controller/ErrorHandler",
    "z/bts/buildtrack551/controller/delegate/SecurityDelegate"
], (UIComponent, models, ErrorHandler, SecurityDelegate) => {
    "use strict";

    return UIComponent.extend("z.bts.buildtrack551.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            // initialize the error handler with the component
            this._oErrorHandler = new ErrorHandler(this);

            // Initialize global security and user profile
            this._oSecurity = new SecurityDelegate();
            this._oSecurity.initialize(this);

            // ── SAP FIORI STANDARD: Remove width limitation ──
            // Calls the FLP ShellUIService to allow the app to fill the full
            // shell canvas (removes sapUShellApplicationContainerLimitedWidth).
            // Falls back silently when running outside FLP (e.g. standalone).
            try {
                var oShellService = sap.ushell &&
                    sap.ushell.Container &&
                    sap.ushell.Container.getServiceAsync("ShellUIService");
                if (oShellService && oShellService.then) {
                    oShellService.then(function (oService) {
                        if (oService && oService.setAppWidthLimited) {
                            oService.setAppWidthLimited(false);
                        }
                    });
                }
            } catch (e) {
                // Not running inside FLP — ignore silently
            }
        },

        /**
         * The component is destroyed by UI5 automatically.
         * In this method, the ErrorHandler is destroyed.
         * @public
         * @override
         */
        destroy() {
            if (this._oErrorHandler) {
                this._oErrorHandler.destroy();
            }
            // call the base component's destroy function
            UIComponent.prototype.destroy.apply(this, arguments);
        }
    });
});