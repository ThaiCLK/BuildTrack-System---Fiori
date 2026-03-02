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
    "sap/ui/model/FilterOperator"
], function (Controller, History, MessageToast, MessageBox,
    Dialog, Button, Label, Input, Select, Item, VBox, HBox, SimpleForm, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.Site", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Site").attachPatternMatched(this._onObjectMatched, this);
        },

        // ── FORMATTERS ──────────────────────────────────────────────────────
        formatStatusIcon: function (sStatus) {
            var m = {
                "OPEN": "sap-icon://status-inactive",
                "PLANNING": "sap-icon://status-in-process",
                "ACTIVE": "sap-icon://status-positive",
                "CLOSED": "sap-icon://status-negative"
            };
            return m[(sStatus || "").toUpperCase()] || "sap-icon://status-inactive";
        },

        formatStatusState: function (sStatus) {
            var m = {
                "OPEN": "None",
                "PLANNING": "Warning",
                "ACTIVE": "Success",
                "CLOSED": "Error"
            };
            return m[(sStatus || "").toUpperCase()] || "None";
        },

        _onObjectMatched: function (oEvent) {
            var sProjectId = oEvent.getParameter("arguments").project_id;
            this._sCurrentProjectId = sProjectId;
            var oView = this.getView();
            oView.bindElement({
                path: "/ProjectSet(guid'" + sProjectId + "')"
            });

            // 2. Filter the existing SiteSet binding initialized by XML
            var oTable = this.byId("siteTable");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter([new Filter("ProjectId", FilterOperator.EQ, sProjectId)]);
            }
        },

        onSitePress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            if (!oCtx) return;
            this.getOwnerComponent().getRouter().navTo("SiteDetail", {
                site_id: oCtx.getProperty("SiteId")
            });
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            if (oHistory.getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteMain", {}, true);
            }
        },

        onAddSite: function () {
            this._openSiteDialog(null);
        },

        onEditSite: function (oEvent) {
            oEvent.cancelBubble && oEvent.cancelBubble();
            var oContext = oEvent.getSource().getBindingContext();
            this._openSiteDialog(oContext);
        },

        onDeleteSite: function (oEvent) {
            oEvent.cancelBubble && oEvent.cancelBubble();
            var oContext = oEvent.getSource().getBindingContext();
            var sName = oContext.getProperty("SiteName");
            var sPath = oContext.getPath();
            var oModel = this.getOwnerComponent().getModel();

            MessageBox.confirm("Are you sure you want to delete site \"" + sName + "\"?", {
                title: "Confirm Delete",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove(sPath, {
                            success: function () { MessageToast.show("Site deleted successfully!"); },
                            error: function () { MessageBox.error("Unable to delete site."); }
                        });
                    }
                }
            });
        },

        _openSiteDialog: function (oContext) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();

            var oInputCode = new Input({ placeholder: "e.g. SITE-001" });
            var oInputName = new Input({ placeholder: "Site name" });
            var oInputAddress = new Input({ placeholder: "Address" });
            var oSelectStatus = new Select({
                width: "100%",
                items: [
                    new Item({ key: "OPEN", text: "Open" }),
                    new Item({ key: "PLANNING", text: "Planning" }),
                    new Item({ key: "ACTIVE", text: "Active" }),
                    new Item({ key: "CLOSED", text: "Closed" })
                ]
            });

            if (bEdit) {
                oInputCode.setValue(oContext.getProperty("SiteCode"));
                oInputName.setValue(oContext.getProperty("SiteName"));
                oInputAddress.setValue(oContext.getProperty("Address"));
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
            }

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: [
                    new Label({ text: "Site Code", required: true }), oInputCode,
                    new Label({ text: "Site Name", required: true }), oInputName,
                    new Label({ text: "Address" }), oInputAddress,
                    new Label({ text: "Status" }), oSelectStatus
                ]
            });

            var oDialog = new Dialog({
                title: bEdit ? "Edit Site" : "Add New Site",
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? "Save Changes" : "Create",
                    type: "Emphasized",
                    press: function () {
                        var sCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        if (!sCode || !sName) {
                            MessageToast.show("Please enter Site Code and Name!");
                            return;
                        }
                        var oPayload = {
                            SiteCode: sCode,
                            SiteName: sName,
                            Address: oInputAddress.getValue().trim(),
                            Status: oSelectStatus.getSelectedKey()
                        };
                        if (!bEdit) {
                            oPayload.ProjectId = that._sCurrentProjectId;
                        }
                        if (bEdit) {
                            oModel.update(oContext.getPath(), oPayload, {
                                success: function () { MessageToast.show("Site updated!"); oDialog.close(); },
                                error: function () { MessageBox.error("Error updating site!"); }
                            });
                        } else {
                            oModel.create("/SiteSet", oPayload, {
                                success: function () { MessageToast.show("Site created successfully!"); oDialog.close(); },
                                error: function () { MessageBox.error("Error creating site!"); }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.addStyleClass("sapUiContentPadding");
            oDialog.open();
        }
    });
});