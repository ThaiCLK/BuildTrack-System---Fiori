sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/m/ComboBox",
    "sap/ui/core/Item",
    "sap/m/DatePicker",
    "sap/ui/layout/form/SimpleForm"
], function (Controller, History, Filter, FilterOperator, JSONModel, Sorter, MessageToast, MessageBox,
    Dialog, Button, Label, Input, Select, ComboBox, Item, DatePicker, SimpleForm) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.ProjectManagement", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                statusItems: [],
                typeItems: []
            }), "vh");

            this._loadProjectValueHelps();

            var oTable = this.byId("projectTable");
            if (oTable) {
                oTable.attachEventOnce("updateFinished", function () {
                    var oBinding = oTable.getBinding("items");
                    if (oBinding) {
                        oBinding.sort(new Sorter("StartDate", true));
                    }
                });
            }
        },

        _loadProjectValueHelps: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oVhModel = this.getView().getModel("vh");
            if (!oModel || !oVhModel || !oModel.read) {
                return;
            }

            oModel.read("/ProjectSet", {
                urlParameters: {
                    "$select": "Status,ProjectType",
                    "$top": "200"
                },
                success: function (oData) {
                    var aResults = (oData && oData.results) ? oData.results : [];

                    var mStatuses = Object.create(null);
                    var mTypes = Object.create(null);

                    aResults.forEach(function (oRow) {
                        var sStatus = (oRow.Status || "").toString().trim();
                        var sType = (oRow.ProjectType || "").toString().trim();
                        if (sStatus) {
                            mStatuses[sStatus] = true;
                        }
                        if (sType) {
                            mTypes[sType] = true;
                        }
                    });

                    var aStatusKeys = Object.keys(mStatuses).sort();
                    var aTypeKeys = Object.keys(mTypes).sort();

                    oVhModel.setProperty("/statusItems", aStatusKeys.map(function (sKey) {
                        return { key: sKey, text: sKey };
                    }));
                    oVhModel.setProperty("/typeItems", aTypeKeys.map(function (sKey) {
                        return { key: sKey, text: sKey };
                    }));
                },
                error: function () {
                    oVhModel.setProperty("/statusItems", []);
                    oVhModel.setProperty("/typeItems", []);
                }
            });
        },

        // ── FORMATTERS ────────────────────────────────────────────────────────
        formatTypeIcon: function (sType) {
            var mIcons = {
                "ROAD": "sap-icon://car-rental",
                "BRIDGE": "sap-icon://functional-location",
                "BUILDING": "sap-icon://building",
                "TUNNEL": "sap-icon://passenger-train"
            };
            return mIcons[(sType || "").toUpperCase()] || "sap-icon://tag";
        },

        formatTypeState: function (sType) {
            var mStates = {
                "ROAD": "Warning",
                "BRIDGE": "Information",
                "BUILDING": "Success",
                "TUNNEL": "None"
            };
            return mStates[(sType || "").toUpperCase()] || "None";
        },

        formatStatusText: function (sStatus) {
            var mLabels = {
                "PLANNING": "Planning",
                "IN_PROGRESS": "In Progress",
                "CLOSED": "Closed"
            };
            return mLabels[(sStatus || "").toUpperCase()] || sStatus;
        },

        // ── NAVIGATE BACK TO DASHBOARD ────────────────────────────────────────
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard", {}, true);
        },

        // ── FILTER BAR (GO) ───────────────────────────────────────────────
        onFilterSearch: function () {
            var oTable = this.byId("projectTable");
            var oBinding = oTable ? oTable.getBinding("items") : null;
            if (!oBinding) {
                return;
            }

            var sQuery = (this.byId("fbSearchField").getValue() || "").trim();

            var oStatus = this.byId("fbStatus");
            var oType = this.byId("fbType");
            var sStatus = (oStatus.getSelectedKey && oStatus.getSelectedKey()) || (oStatus.getValue && oStatus.getValue()) || "";
            var sType = (oType.getSelectedKey && oType.getSelectedKey()) || (oType.getValue && oType.getValue()) || "";
            sStatus = (sStatus || "").trim();
            sType = (sType || "").trim();

            var dStart = this.byId("fbStartDate").getDateValue();
            var dEnd = this.byId("fbEndDate").getDateValue();

            var aFilters = [];
            
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("ProjectCode", FilterOperator.Contains, sQuery),
                        new Filter("ProjectName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            if (sStatus) {
                aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
            }
            if (sType) {
                aFilters.push(new Filter("ProjectType", FilterOperator.EQ, sType));
            }
            if (dStart) {
                aFilters.push(new Filter("StartDate", FilterOperator.GE, dStart));
            }
            if (dEnd) {
                aFilters.push(new Filter("EndDate", FilterOperator.LE, dEnd));
            }

            oBinding.filter(aFilters);
            oBinding.sort(new Sorter("StartDate", true));
        },

        onFilterClear: function () {
            this.byId("fbSearchField").setValue("");
            this.byId("fbStatus").setSelectedKey("");
            this.byId("fbStatus").setValue("");
            this.byId("fbType").setSelectedKey("");
            this.byId("fbType").setValue("");
            this.byId("fbStartDate").setValue("");
            this.byId("fbEndDate").setValue("");
            this.onFilterSearch();
        },

        // ── NAVIGATE ─────────────────────────────────────────────────────────
        onPressProject: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sProjectId = oContext.getProperty("ProjectId");
            var sProjectName = oContext.getProperty("ProjectName");
            this.getOwnerComponent().getRouter().navTo("Site", { project_id: sProjectId });
            MessageToast.show("Opening: " + sProjectName);
        },

        // ── CREATE ────────────────────────────────────────────────────────────
        onPressCreate: function () {
            this._openProjectDialog(null);
        },

        // ── EDIT ──────────────────────────────────────────────────────────────
        onEditProject: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            this._openProjectDialog(oContext);
        },

        // ── DELETE ────────────────────────────────────────────────────────────
        onDeleteProject: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var sName = oContext.getProperty("ProjectName");
            var sPath = oContext.getPath();
            var oModel = this.getOwnerComponent().getModel();

            MessageBox.confirm("Are you sure you want to delete project \"" + sName + "\"?", {
                title: "Confirm Delete",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove(sPath, {
                            success: function () {
                                MessageToast.show("Project deleted successfully!");
                            },
                            error: function () {
                                MessageBox.error("Unable to delete project. Please try again.");
                            }
                        });
                    }
                }
            });
        },

        // ── PRIVATE: Create/Edit Project Dialog ──────────────────────────────
        _openProjectDialog: function (oContext) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();

            var oInputCode = new Input({
                placeholder: "e.g. PRJ-001",
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValue(oSource.getValue().toUpperCase());
                }
            });
            var oInputName = new Input({ placeholder: "Project name" });
            // ComboBox allows selecting a preset type OR typing a custom value for "Other"
            var oComboType = new ComboBox({
                width: "100%",
                placeholder: "Select or type a type",
                items: [
                    new Item({ key: "ROAD", text: "Road" }),
                    new Item({ key: "BRIDGE", text: "Bridge" }),
                    new Item({ key: "BUILDING", text: "Building" }),
                    new Item({ key: "TUNNEL", text: "Tunnel" }),
                    new Item({ key: "OTHER", text: "Other" })
                ]
            });
            var oPickerStart = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd" });
            var oPickerEnd = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd" });
            var oSelectStatus = new Select({
                width: "100%",
                enabled: false, // Status can never be edited manually (always disabled)
                items: [
                    new Item({ key: "PLANNING", text: "Planning" }),
                    new Item({ key: "IN_PROGRESS", text: "In Progress" }),
                    new Item({ key: "CLOSED", text: "Closed" })
                ]
            });
            // Default to PLANNING for new projects
            if (!bEdit) {
                oSelectStatus.setSelectedKey("PLANNING");
            }

            if (bEdit) {
                oInputCode.setValue(oContext.getProperty("ProjectCode"));
                oInputName.setValue(oContext.getProperty("ProjectName"));
                // For ComboBox: set the selected key first; if it doesn't match a preset, set the value text directly
                var sType = oContext.getProperty("ProjectType") || "";
                oComboType.setSelectedKey(sType);
                if (!oComboType.getSelectedKey()) {
                    oComboType.setValue(sType); // custom / unknown value
                }
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
                var oStart = oContext.getProperty("StartDate");
                var oEnd = oContext.getProperty("EndDate");
                if (oStart) oPickerStart.setDateValue(oStart);
                if (oEnd) oPickerEnd.setDateValue(oEnd);
            }

            var aFormContent = [
                new Label({ text: "Project Code", required: true }), oInputCode,
                new Label({ text: "Project Name", required: true }), oInputName,
                new Label({ text: "Project Type" }), oComboType,
                new Label({ text: "Start Date" }), oPickerStart,
                new Label({ text: "Est. End Date" }), oPickerEnd
            ];

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: aFormContent
            });

            var oDialog = new Dialog({
                title: bEdit ? "Edit Project" : "Create New Project",
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? "Save Changes" : "Create",
                    type: "Emphasized",
                    press: function () {
                        var sCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        if (!sCode || !sName) {
                            MessageToast.show("Please enter Project Code and Name!");
                            return;
                        }
                        var oPayload = {
                            ProjectCode: sCode,
                            ProjectName: sName,
                            ProjectType: oComboType.getValue().trim() || oComboType.getSelectedKey(),
                            StartDate: oPickerStart.getDateValue(),
                            EndDate: oPickerEnd.getDateValue(),
                            Status: oSelectStatus.getSelectedKey()
                        };
                        if (bEdit) {
                            oModel.update(oContext.getPath(), oPayload, {
                                success: function () { MessageToast.show("Project updated!"); oDialog.close(); },
                                error: function () { MessageBox.error("Error updating project!"); }
                            });
                        } else {
                            oModel.create("/ProjectSet", oPayload, {
                                success: function () { MessageToast.show("Project created successfully!"); oDialog.close(); },
                                error: function () { MessageBox.error("Error creating project!"); }
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