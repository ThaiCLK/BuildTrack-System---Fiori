sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Sorter",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem",
    "sap/m/Token",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
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
], function (Controller, History, JSONModel, Sorter, ValueHelpDialog, FilterBar, FilterGroupItem, Token, Column, ColumnListItem, Text, MessageToast, MessageBox,
    Dialog, Button, Label, Input, Select, ComboBox, Item, DatePicker, SimpleForm) {
    "use strict";

    return Controller.extend("z.bts.buildtrack.controller.ProjectManagement", {

        onInit: function () {
            this._mProjectField = {
                id: "ProjectId",
                code: "ProjectCode",
                name: "ProjectName",
                type: "ProjectType",
                startDate: "StartDate",
                endDate: "EndDate",
                status: "Status"
            };
            this._sProjectCollectionPath = "/ProjectSet";
            this._oCurrentCriteria = {
                projectCode: "",
                projectName: "",
                status: "",
                type: "",
                startDate: null,
                endDate: null
            };

            this.getView().setModel(new JSONModel({
                projectCodeItems: [],
                projectNameItems: [],
                statusItems: [],
                typeItems: []
            }), "vh");
            this.getView().setModel(new JSONModel({
                projects: []
            }), "pm");

            var oFilterBar = this.byId("projectFilterBar");
            if (oFilterBar) {
                oFilterBar.detachSearch(this.onFilterSearch, this);
                oFilterBar.detachClear(this.onFilterClear, this);
                oFilterBar.attachSearch(this.onFilterSearch, this);
                oFilterBar.attachClear(this.onFilterClear, this);
            }

            this._loadProjectValueHelps();
            this._readProjects("");
        },

        _resolveProjectCollectionPath: function () {
            var oMeta = this.getOwnerComponent().getModel().getServiceMetadata();
            if (!oMeta || !oMeta.dataServices || !oMeta.dataServices.schema || !oMeta.dataServices.schema.length) {
                return this._sProjectCollectionPath;
            }

            var aEntitySets = [];
            oMeta.dataServices.schema.forEach(function (oSchema) {
                var aContainers = oSchema.entityContainer || [];
                aContainers.forEach(function (oContainer) {
                    var aSets = oContainer.entitySet || [];
                    aSets.forEach(function (oSet) {
                        aEntitySets.push(oSet.name);
                    });
                });
            });

            if (aEntitySets.indexOf("ProjectSet") !== -1) {
                this._sProjectCollectionPath = "/ProjectSet";
            } else if (aEntitySets.indexOf("ZC_BT_PROJECT") !== -1) {
                this._sProjectCollectionPath = "/ZC_BT_PROJECT";
            }

            return this._sProjectCollectionPath;
        },

        _loadProjectValueHelps: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oVhModel = this.getView().getModel("vh");
            if (!oModel || !oVhModel || !oModel.read) {
                return;
            }

            var sPath = this._resolveProjectCollectionPath();

            oModel.read(sPath, {
                success: function (oData) {
                    var aResults = (oData && oData.results) ? oData.results : [];

                    var mCodes = Object.create(null);
                    var mNames = Object.create(null);
                    var mStatuses = Object.create(null);
                    var mTypes = Object.create(null);

                    aResults.forEach(function (oRow) {
                        var sCode = (oRow.ProjectCode || oRow.project_code || "").toString().trim();
                        var sName = (oRow.ProjectName || oRow.project_name || "").toString().trim();
                        var sStatus = (oRow.Status || oRow.status || "").toString().trim();
                        var sType = (oRow.ProjectType || oRow.project_type || "").toString().trim();
                        if (sCode) {
                            mCodes[sCode] = sName;
                        }
                        if (sName) {
                            mNames[sName] = sCode;
                        }
                        if (sStatus) {
                            mStatuses[sStatus] = true;
                        }
                        if (sType) {
                            mTypes[sType] = true;
                        }
                    });

                    var aCodeKeys = Object.keys(mCodes).sort();
                    var aNameKeys = Object.keys(mNames).sort();
                    var aStatusKeys = Object.keys(mStatuses).sort();
                    var aTypeKeys = Object.keys(mTypes).sort();

                    oVhModel.setProperty("/projectCodeItems", aCodeKeys.map(function (sKey) {
                        return { key: sKey, text: sKey, additionalText: mCodes[sKey] || "" };
                    }));
                    oVhModel.setProperty("/projectNameItems", aNameKeys.map(function (sKey) {
                        return { key: sKey, text: sKey, additionalText: mNames[sKey] || "" };
                    }));
                    oVhModel.setProperty("/statusItems", aStatusKeys.map(function (sKey) {
                        return { key: sKey, text: sKey };
                    }));
                    oVhModel.setProperty("/typeItems", aTypeKeys.map(function (sKey) {
                        return { key: sKey, text: sKey };
                    }));
                },
                error: function () {
                    oVhModel.setProperty("/projectCodeItems", []);
                    oVhModel.setProperty("/projectNameItems", []);
                    oVhModel.setProperty("/statusItems", []);
                    oVhModel.setProperty("/typeItems", []);
                }
            });
        },

        _escapeODataString: function (sValue) {
            return (sValue || "").replace(/'/g, "''");
        },

        _openSimpleValueHelpDialog: function (mOptions) {
            var oInput = this.byId(mOptions.inputId);
            var oVhModel = this.getView().getModel("vh");
            var aAllItems = (oVhModel && oVhModel.getProperty(mOptions.itemsPath)) || [];

            var fnWildcardMatch = function (sValue, sPattern) {
                if (!sPattern) {
                    return true;
                }
                var sEscaped = sPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
                var oRegex = new RegExp("^" + sEscaped + "$", "i");
                return oRegex.test(sValue || "");
            };

            var oTableModel = new JSONModel(aAllItems);
            var fnApplyPatternFilter = function (sPatternRaw) {
                var sPattern = (sPatternRaw || "").trim();
                if (!sPattern) {
                    oTableModel.setData(aAllItems);
                    return;
                }
                var bHasWildcard = sPattern.indexOf("*") !== -1;
                var aFiltered = aAllItems.filter(function (oItem) {
                    var sKey = (oItem.key || "").toString();
                    var sText = (oItem.text || "").toString();
                    if (bHasWildcard) {
                        return fnWildcardMatch(sKey, sPattern) || fnWildcardMatch(sText, sPattern);
                    }
                    var sNeedle = sPattern.toLowerCase();
                    return sKey.toLowerCase().indexOf(sNeedle) !== -1 || sText.toLowerCase().indexOf(sNeedle) !== -1;
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
                    var sValue = aTokens.length > 0 ? aTokens[0].getKey() : "";
                    oInput.setValue(sValue);
                    oDialog.close();
                },
                cancel: function () {
                    oDialog.close();
                },
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.setRangeKeyFields([
                {
                    label: mOptions.title,
                    key: "key",
                    type: "string"
                }
            ]);

            if (mOptions.enablePatternFilter) {
                var oPatternInput = new Input({
                    placeholder: "PRJ* hoặc *PRJ*"
                });

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
                    name: "Pattern",
                    label: "Pattern",
                    visibleInFilterBar: true,
                    control: oPatternInput
                }));

                oDialog.setFilterBar(oInnerFilterBar);
            }

            var sCurrent = (oInput.getValue() || "").trim();
            if (sCurrent) {
                oDialog.setTokens([
                    new Token({ key: sCurrent, text: sCurrent })
                ]);
            }

            oDialog.getTableAsync().then(function (oTable) {
                oTable.setModel(oTableModel);

                if (oTable.bindRows) {
                    oTable.addColumn(new sap.ui.table.Column({ label: new Label({ text: mOptions.primaryLabel }), template: new Text({ text: "{key}" }) }));
                    if (mOptions.showSecondary) {
                        oTable.addColumn(new sap.ui.table.Column({ label: new Label({ text: mOptions.secondaryLabel }), template: new Text({ text: "{additionalText}" }) }));
                    }
                    oTable.bindRows("/");
                } else {
                    oTable.addColumn(new Column({ header: new Label({ text: mOptions.primaryLabel }) }));
                    if (mOptions.showSecondary) {
                        oTable.addColumn(new Column({ header: new Label({ text: mOptions.secondaryLabel }) }));
                    }
                    var aCells = [new Text({ text: "{key}" })];
                    if (mOptions.showSecondary) {
                        aCells.push(new Text({ text: "{additionalText}" }));
                    }
                    oTable.bindItems("/", new ColumnListItem({ cells: aCells }));
                }

                oDialog.update();
            });

            oDialog.open();
        },

        onValueHelpProjectCodeRequest: function () {
            this._openSimpleValueHelpDialog({
                inputId: "fbProjectCode",
                title: "Project Code",
                itemsPath: "/projectCodeItems",
                primaryLabel: "Project Code",
                enablePatternFilter: true,
                showSecondary: true,
                secondaryLabel: "Project Name"
            });
        },

        onValueHelpProjectNameRequest: function () {
            this._openSimpleValueHelpDialog({
                inputId: "fbProjectName",
                title: "Project Name",
                itemsPath: "/projectNameItems",
                primaryLabel: "Project Name",
                enablePatternFilter: true,
                showSecondary: true,
                secondaryLabel: "Project Code"
            });
        },

        onValueHelpStatusRequest: function () {
            this._openSimpleValueHelpDialog({
                inputId: "fbStatus",
                title: "Status",
                itemsPath: "/statusItems",
                primaryLabel: "Status",
                showSecondary: false,
                secondaryLabel: ""
            });
        },

        onValueHelpTypeRequest: function () {
            this._openSimpleValueHelpDialog({
                inputId: "fbType",
                title: "Project Type",
                itemsPath: "/typeItems",
                primaryLabel: "Project Type",
                showSecondary: false,
                secondaryLabel: ""
            });
        },

        _detectProjectFieldMap: function (oSample) {
            if (!oSample || typeof oSample !== "object") {
                return;
            }

            if (Object.prototype.hasOwnProperty.call(oSample, "project_id")) {
                this._mProjectField = {
                    id: "project_id",
                    code: "project_code",
                    name: "project_name",
                    type: "project_type",
                    startDate: "start_date",
                    endDate: "end_date",
                    status: "status"
                };
            }
        },

        _buildFilterExpression: function (mInput) {
            var mField = this._mProjectField;
            var aExpr = [];

            if (mInput.projectCode) {
                aExpr.push(mField.code + " eq '" + this._escapeODataString(mInput.projectCode) + "'");
            }
            if (mInput.projectName) {
                aExpr.push(mField.name + " eq '" + this._escapeODataString(mInput.projectName) + "'");
            }
            if (mInput.status) {
                aExpr.push(mField.status + " eq '" + this._escapeODataString(mInput.status) + "'");
            }
            if (mInput.type) {
                aExpr.push(mField.type + " eq '" + this._escapeODataString(mInput.type) + "'");
            }
            if (mInput.startDate) {
                aExpr.push(mField.startDate + " eq " + this._formatDateTimeLiteral(mInput.startDate));
            }
            if (mInput.endDate) {
                aExpr.push(mField.endDate + " eq " + this._formatDateTimeLiteral(mInput.endDate));
            }

            return aExpr.join(" and ");
        },

        _normalizeProjectRow: function (oRow) {
            return {
                ProjectId: oRow.ProjectId || oRow.project_id || "",
                ProjectCode: oRow.ProjectCode || oRow.project_code || "",
                ProjectName: oRow.ProjectName || oRow.project_name || "",
                ProjectType: oRow.ProjectType || oRow.project_type || "",
                StartDate: oRow.StartDate || oRow.start_date || null,
                EndDate: oRow.EndDate || oRow.end_date || null,
                Status: oRow.Status || oRow.status || ""
            };
        },

        _dateOnlyKey: function (vDate) {
            if (!vDate) {
                return "";
            }
            var oDate = vDate instanceof Date ? vDate : new Date(vDate);
            if (isNaN(oDate.getTime())) {
                return "";
            }
            var y = oDate.getFullYear();
            var m = oDate.getMonth() + 1;
            var d = oDate.getDate();
            return y + "-" + (m < 10 ? "0" + m : String(m)) + "-" + (d < 10 ? "0" + d : String(d));
        },

        _applyCriteriaLocal: function (aRows) {
            var oC = this._oCurrentCriteria || {};
            var sProjectCode = (oC.projectCode || "").toLowerCase();
            var sProjectName = (oC.projectName || "").toLowerCase();
            var sStatus = (oC.status || "").trim();
            var sType = (oC.type || "").trim();
            var sStart = this._dateOnlyKey(oC.startDate);
            var sEnd = this._dateOnlyKey(oC.endDate);

            return (aRows || []).filter(function (oRow) {
                var sRowName = (oRow.ProjectName || "").toLowerCase();
                var sRowCode = (oRow.ProjectCode || "").toLowerCase();
                var bCode = !sProjectCode || sRowCode === sProjectCode;
                var bName = !sProjectName || sRowName === sProjectName;
                var bStatus = !sStatus || (oRow.Status || "") === sStatus;
                var bType = !sType || (oRow.ProjectType || "") === sType;
                var bStart = !sStart || this._dateOnlyKey(oRow.StartDate) === sStart;
                var bEnd = !sEnd || this._dateOnlyKey(oRow.EndDate) === sEnd;
                return bCode && bName && bStatus && bType && bStart && bEnd;
            }.bind(this));
        },

        _formatDateTimeLiteral: function (oDate) {
            var iYear = oDate.getFullYear();
            var iMonth = oDate.getMonth() + 1;
            var iDay = oDate.getDate();
            var sMonth = iMonth < 10 ? "0" + iMonth : String(iMonth);
            var sDay = iDay < 10 ? "0" + iDay : String(iDay);
            return "datetime'" + iYear + "-" + sMonth + "-" + sDay + "T00:00:00'";
        },

        _readProjects: function (sFilterExpr) {
            var oModel = this.getOwnerComponent().getModel();
            var oPmModel = this.getView().getModel("pm");
            if (!oModel || !oPmModel) {
                return;
            }

            var sPath = this._resolveProjectCollectionPath();
            var mUrlParameters = {};
            if (sFilterExpr) {
                mUrlParameters.$filter = sFilterExpr;
            }

            oModel.read(sPath, {
                urlParameters: mUrlParameters,
                success: function (oData) {
                    var aResults = (oData && oData.results) ? oData.results : [];
                    if (aResults.length > 0) {
                        this._detectProjectFieldMap(aResults[0]);
                    }
                    var aNormalized = aResults.map(this._normalizeProjectRow.bind(this));
                    aNormalized = this._applyCriteriaLocal(aNormalized);
                    aNormalized.sort(function (a, b) {
                        var iA = a.StartDate ? new Date(a.StartDate).getTime() : 0;
                        var iB = b.StartDate ? new Date(b.StartDate).getTime() : 0;
                        return iB - iA;
                    });
                    oPmModel.setProperty("/projects", aNormalized);
                }.bind(this),
                error: function () {
                    oPmModel.setProperty("/projects", []);
                }
            });
        },

        _getProjectEntityPath: function (oContext) {
            if (!oContext) {
                return null;
            }

            var sPath = oContext.getPath ? oContext.getPath() : "";
            if (sPath && sPath.indexOf("/ProjectSet(") === 0) {
                return sPath;
            }

            var sProjectId = oContext.getProperty("ProjectId");
            if (!sProjectId) {
                return null;
            }
            return this._resolveProjectCollectionPath() + "(guid'" + sProjectId + "')";
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
            var sProjectCode = (this.byId("fbProjectCode").getValue() || "").trim();
            var sProjectName = (this.byId("fbProjectName").getValue() || "").trim();
            var sStatus = (this.byId("fbStatus").getValue() || "").trim();
            var sType = (this.byId("fbType").getValue() || "").trim();

            var dStart = this.byId("fbStartDate").getDateValue();
            var dEnd = this.byId("fbEndDate").getDateValue();

            var sFilterExpr = this._buildFilterExpression({
                projectCode: sProjectCode,
                projectName: sProjectName,
                status: sStatus,
                type: sType,
                startDate: dStart,
                endDate: dEnd
            });

            this._oCurrentCriteria = {
                projectCode: sProjectCode,
                projectName: sProjectName,
                status: sStatus,
                type: sType,
                startDate: dStart,
                endDate: dEnd
            };

            this._readProjects(sFilterExpr);
        },

        onFilterClear: function () {
            this.byId("fbProjectCode").setValue("");
            this.byId("fbProjectName").setValue("");
            this.byId("fbStatus").setValue("");
            this.byId("fbType").setValue("");
            this.byId("fbStartDate").setValue("");
            this.byId("fbEndDate").setValue("");
            this.onFilterSearch();
        },

        // ── NAVIGATE ─────────────────────────────────────────────────────────
        onPressProject: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("pm") || oEvent.getSource().getBindingContext();
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
            var oContext = oEvent.getSource().getBindingContext("pm") || oEvent.getSource().getBindingContext();
            this._openProjectDialog(oContext);
        },

        // ── DELETE ────────────────────────────────────────────────────────────
        onDeleteProject: function (oEvent) {
            var that = this;
            var oContext = oEvent.getSource().getBindingContext("pm") || oEvent.getSource().getBindingContext();
            var sName = oContext.getProperty("ProjectName");
            var sPath = this._getProjectEntityPath(oContext);
            var oModel = this.getOwnerComponent().getModel();

            if (!sPath) {
                MessageBox.error("Cannot determine Project path for delete.");
                return;
            }

            MessageBox.confirm("Are you sure you want to delete project \"" + sName + "\"?", {
                title: "Confirm Delete",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove(sPath, {
                            success: function () {
                                MessageToast.show("Project deleted successfully!");
                                that._readProjects("");
                            },
                            error: function () {
                                MessageBox.error("Unable to delete project. Please try again.");
                            }
                        });
                    }
                }.bind(this)
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
                            var sUpdatePath = that._getProjectEntityPath(oContext);
                            if (!sUpdatePath) {
                                MessageBox.error("Cannot determine Project path for update.");
                                return;
                            }
                            oModel.update(sUpdatePath, oPayload, {
                                success: function () { MessageToast.show("Project updated!"); that._readProjects(""); oDialog.close(); },
                                error: function () { MessageBox.error("Error updating project!"); }
                            });
                        } else {
                            oModel.create("/ProjectSet", oPayload, {
                                success: function () { MessageToast.show("Project created successfully!"); that._readProjects(""); oDialog.close(); },
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