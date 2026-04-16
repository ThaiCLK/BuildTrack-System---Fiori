sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat"
], function (Controller, Fragment, JSONModel, MessageToast, MessageBox, DateFormat) {
    "use strict";

    return Controller.extend("z.bts.buildtrack551.controller.SystemConfig", {
        onInit: function () {
            // Edit Model binding to the fragment pop-up
            var oEditModel = new JSONModel({
                ConfigName: "",
                ConfigValue: "",
                isSelect: false,
                AvailableOptions: []
            });
            this.getView().setModel(oEditModel, "editConfig");
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        onSelectionChange: function (oEvent) {
            var oTable = this.byId("configTable");
            var aSelectedItems = oTable.getSelectedItems();
            this.byId("btnEditConfig").setEnabled(aSelectedItems.length === 1);
        },

        onItemPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oTable = this.byId("configTable");
            oTable.removeSelections(true);
            oTable.setSelectedItem(oItem, true);
            this.onSelectionChange();
            this.onOpenEditDialog();
        },

        onOpenEditDialog: function () {
            var oTable = this.byId("configTable");
            var oItem = oTable.getSelectedItem();
            if (!oItem) { return; }

            var oContext = oItem.getBindingContext();
            var oData = oContext.getObject();
            var oModel = this.getView().getModel("editConfig");

            oModel.setProperty("/ConfigName", oData.ConfigName);
            oModel.setProperty("/ConfigValue", oData.ConfigValue);

            // Setup predefined option rules from Backend logic
            var aOptions = [];
            var bIsSelect = true;

            if (oData.ConfigName === "AUTHORIZATION_TYPE") {
                aOptions = [
                    { key: "AUTHORIZATION_OBJECT", text: "AUTHORIZATION_OBJECT", desc: "(Object Mức hệ thống)" },
                    { key: "TABLE_ZBT", text: "TABLE_ZBT", desc: "(Bảng nội bộ)" }
                ];
            } else if (oData.ConfigName === "EMAIL_SENDER") {
                aOptions = [
                    { key: "APPS_SCRIPT", text: "APPS_SCRIPT", desc: "(Dịch vụ thư Google)" },
                    { key: "SENDGRID", text: "SENDGRID", desc: "(Dịch vụ thư SMTP Twilio)" }
                ];
            } else {
                bIsSelect = false;
            }

            oModel.setProperty("/AvailableOptions", aOptions);
            oModel.setProperty("/isSelect", bIsSelect);

            if (!this._oDialog) {
                Fragment.load({
                    name: "z.bts.buildtrack551.view.fragments.ConfigDialog",
                    controller: this
                }).then(function (oDialog) {
                    this._oDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                }.bind(this));
            } else {
                this._oDialog.open();
            }
        },

        onCancelConfig: function () {
            if (this._oDialog) {
                this._oDialog.close();
            }
        },

        onSaveConfig: function () {
            var oEditModel = this.getView().getModel("editConfig");
            var sKey = oEditModel.getProperty("/ConfigName");
            var sVal = oEditModel.getProperty("/ConfigValue");

            if (!sVal || sVal.trim() === "") {
                MessageBox.error("Giá trị cấu hình không được để trống.");
                return;
            }

            var oPayload = {
                ConfigName: sKey,
                ConfigValue: sVal.trim()
            };

            var oModel = this.getView().getModel();
            this.getView().setBusy(true);

            oModel.update("/ConfigSet('" + sKey + "')", oPayload, {
                success: function () {
                    this.getView().setBusy(false);
                    MessageToast.show("Đã cập nhật hệ thống thành công!");
                    this._oDialog.close();
                    
                    // Gửi tín hiệu Refresh toàn hệ thống
                    sap.ui.getCore().getEventBus().publish("Global", "RefreshData");

                }.bind(this),
                error: function (oError) {
                    this.getView().setBusy(false);
                    try {
                        var sMsg = JSON.parse(oError.responseText).error.message.value;
                        MessageBox.error(sMsg);
                    } catch (e) {
                        MessageBox.error("Hệ thống không thể cập nhật cấu hình xin vui lòng thử lại sau.");
                    }
                }.bind(this)
            });
        },

        // --- Formatters ---
        formatDateTime: function (oDate1, oDate2) {
            // OData Returns Time and Date independently if declared seperately, or just combine
            // It seems UpdatedOn is Date and UpdatedAt is Time
            // For now, let's just show UpdatedOn and UpdatedAt together safely.
            if (!oDate1) return "";
            var sDate = "", sTime = "";
            var oDateFormat = DateFormat.getDateInstance({pattern: "dd/MM/yyyy"});
            var oTimeFormat = DateFormat.getTimeInstance({pattern: "HH:mm:ss"});
            
            if (oDate1 instanceof Date) { sDate = oDateFormat.format(oDate1); }
            if (oDate2 && oDate2.ms !== undefined) { 
                var offsetTime = new Date(oDate2.ms + oDate1.getTimezoneOffset() * 60000);
                sTime = oTimeFormat.format(offsetTime);
            }
            if (!sTime) return sDate;
            return sDate + " lúc " + sTime;
        }
    });
});
