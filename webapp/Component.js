sap.ui.define([
    "sap/ui/core/UIComponent",
    "z/bts/buildtrack/model/models",
    "z/bts/buildtrack/controller/ErrorHandler"
], (UIComponent, models, ErrorHandler) => {
    "use strict";

    return UIComponent.extend("z.bts.buildtrack.Component", {
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