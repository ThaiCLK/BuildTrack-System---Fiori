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

    return Controller.extend("z.bts.buildtrack551.controller.ProjectManagement", {

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

            var oTableModel = new JSONModel(aAllItems);
            var fnApplyPatternFilter = function (sPatternRaw) {
                var sNeedle = (sPatternRaw || "").trim().replace(/\*/g, "").toLowerCase();
                if (!sNeedle) {
                    oTableModel.setData(aAllItems);
                    return;
                }
                var aFiltered = aAllItems.filter(function (oItem) {
                    var sKey = (oItem.key || "").toString();
                    var sText = (oItem.text || "").toString();
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
                    placeholder: this.getView().getModel("i18n").getResourceBundle().getText("enterKeyword")
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
                    name: "Contains",
                    label: this.getView().getModel("i18n").getResourceBundle().getText("contains"),
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
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._openSimpleValueHelpDialog({
                inputId: "fbProjectCode",
                title: oBundle.getText("projectCode"),
                itemsPath: "/projectCodeItems",
                primaryLabel: oBundle.getText("projectCode"),
                enablePatternFilter: true,
                showSecondary: true,
                secondaryLabel: oBundle.getText("projectName")
            });
        },

        onValueHelpProjectNameRequest: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._openSimpleValueHelpDialog({
                inputId: "fbProjectName",
                title: oBundle.getText("projectName"),
                itemsPath: "/projectNameItems",
                primaryLabel: oBundle.getText("projectName"),
                enablePatternFilter: true,
                showSecondary: true,
                secondaryLabel: oBundle.getText("projectCode")
            });
        },

        onValueHelpStatusRequest: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._openSimpleValueHelpDialog({
                inputId: "fbStatus",
                title: oBundle.getText("status"),
                itemsPath: "/statusItems",
                primaryLabel: oBundle.getText("status"),
                showSecondary: false,
                secondaryLabel: ""
            });
        },

        onValueHelpTypeRequest: function () {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this._openSimpleValueHelpDialog({
                inputId: "fbType",
                title: oBundle.getText("projectType"),
                itemsPath: "/typeItems",
                primaryLabel: oBundle.getText("projectType"),
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
                var bCode = !sProjectCode || sRowCode.indexOf(sProjectCode) !== -1;
                var bName = !sProjectName || sRowName.indexOf(sProjectName) !== -1;
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
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            this.getOwnerComponent().getRouter().navTo("Site", { project_id: sProjectId });
            MessageToast.show(oBundle.getText("openingProject", [sProjectName]));
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

            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            if (!sPath) {
                MessageBox.error(oBundle.getText("projectPathError"));
                return;
            }

            MessageBox.confirm(oBundle.getText("deleteProjectConfirm", [sName]), {
                title: oBundle.getText("confirmDelete"),
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove(sPath, {
                            success: function () {
                                MessageToast.show(oBundle.getText("projectDeletedSuccess"));
                                that._readProjects("");
                                that._loadProjectValueHelps();
                            },
                            error: function () {
                                MessageBox.error(oBundle.getText("deleteProjectError"));
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

            var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            var oInputCode = new Input({
                placeholder: oBundle.getText("projectCodePlaceholder"),
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValue(oSource.getValue().toUpperCase());
                }
            });
            var oInputName = new Input({ placeholder: oBundle.getText("projectNamePlaceholder") });
            // ComboBox allows selecting a preset type OR typing a custom value for "Other"
            var oComboType = new ComboBox({
                width: "100%",
                placeholder: oBundle.getText("projectTypePlaceholder"),
                items: [
                    new Item({ key: "ROAD", text: oBundle.getText("typeRoad") }),
                    new Item({ key: "BRIDGE", text: oBundle.getText("typeBridge") }),
                    new Item({ key: "BUILDING", text: oBundle.getText("typeBuilding") }),
                    new Item({ key: "TUNNEL", text: oBundle.getText("typeTunnel") }),
                    new Item({ key: "OTHER", text: oBundle.getText("typeOther") })
                ]
            });
            var dToday = new Date();
            dToday.setHours(0, 0, 0, 0);

            var oPickerStart = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd", minDate: dToday });
            var oPickerEnd = new DatePicker({ width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd", minDate: dToday });

            oPickerStart.attachChange(function (oEvent) {
                var dNewStart = oEvent.getSource().getDateValue();
                if (dNewStart) {
                    var dMinEnd = new Date(Math.max(dToday.getTime(), dNewStart.getTime()));
                    dMinEnd.setDate(dMinEnd.getDate() + 1); // End date should be > Start date
                    oPickerEnd.setMinDate(dMinEnd);
                }
            });

            var oSelectStatus = new Select({
                width: "100%",
                enabled: false, // Status can never be edited manually (always disabled)
                items: [
                    new Item({ key: "PLANNING", text: oBundle.getText("planning") }),
                    new Item({ key: "IN_PROGRESS", text: oBundle.getText("inProgress") }),
                    new Item({ key: "CLOSED", text: oBundle.getText("closed") })
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
                var sRawType = oContext.getProperty("ProjectType") || "";
                var sTypeUpper = sRawType.toUpperCase();
                oComboType.setSelectedKey(sTypeUpper);
                if (!oComboType.getSelectedKey()) {
                    oComboType.setValue(sRawType); // custom / unknown value
                }
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
                var oStart = oContext.getProperty("StartDate");
                var oEnd = oContext.getProperty("EndDate");
                
                if (oStart) {
                    oPickerStart.setDateValue(oStart);
                    // Prevent error state if existing date is in the past
                    var dStartMin = new Date(dToday);
                    if (oStart < dToday) {
                        dStartMin = new Date(oStart);
                        dStartMin.setHours(0, 0, 0, 0);
                    }
                    oPickerStart.setMinDate(dStartMin);
                }
                
                if (oEnd) {
                    oPickerEnd.setDateValue(oEnd);
                    var dEndMin = new Date(dToday);
                    if (oEnd < dToday) {
                        dEndMin = new Date(oEnd);
                        dEndMin.setHours(0, 0, 0, 0);
                    }
                    if (oStart && oStart >= dStartMin) {
                        var dMinEndFromStart = new Date(oStart);
                        dMinEndFromStart.setHours(0, 0, 0, 0);
                        dMinEndFromStart.setDate(dMinEndFromStart.getDate() + 1);
                        if (dMinEndFromStart > dEndMin) {
                            dEndMin = dMinEndFromStart;
                        }
                    }
                    oPickerEnd.setMinDate(dEndMin);
                }
            }

            var aFormContent = [
                new Label({ text: oBundle.getText("projectCode"), required: true }), oInputCode,
                new Label({ text: oBundle.getText("projectName"), required: true }), oInputName,
                new Label({ text: oBundle.getText("projectType") }), oComboType,
                new Label({ text: oBundle.getText("startDate") }), oPickerStart,
                new Label({ text: oBundle.getText("estEndDate") }), oPickerEnd
            ];

            var oForm = new SimpleForm({
                editable: true,
                layout: "ResponsiveGridLayout",
                labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                columnsL: 1, columnsM: 1,
                content: aFormContent
            });

            var oDialog = new Dialog({
                title: bEdit ? oBundle.getText("editProjectTitle") : oBundle.getText("createProjectTitle"),
                contentWidth: "450px",
                content: [oForm],
                beginButton: new Button({
                    text: bEdit ? oBundle.getText("saveChanges") : oBundle.getText("create"),
                    type: "Emphasized",
                    press: function () {
                        var sCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();
                        if (!sCode || !sName) {
                            MessageToast.show(oBundle.getText("enterProjectCodeNameError"));
                            return;
                        }

                        // Validate Project Code format: PRJ-YYYY-XXX
                        var rCodePattern = /^PRJ-\d{4}-\d{3}$/;
                        if (!rCodePattern.test(sCode)) {
                            MessageBox.error(oBundle.getText("invalidProjectCodeFormat"));
                            return;
                        }

                        if (!oPickerStart.isValidValue() || !oPickerStart.getDateValue()) {
                            MessageBox.error(oBundle.getText("startDatePastError"));
                            return;
                        }

                        if (!oPickerEnd.isValidValue() || !oPickerEnd.getDateValue()) {
                            MessageBox.error(oBundle.getText("endDateBeforeStartError"));
                            return;
                        }

                        var dStart = oPickerStart.getDateValue();
                        var dEnd = oPickerEnd.getDateValue();

                        if (!bEdit) {
                            var dToday = new Date();
                            dToday.setHours(0, 0, 0, 0);
                            var dStartCompare = new Date(dStart.getTime());
                            dStartCompare.setHours(0, 0, 0, 0);

                            if (dStartCompare < dToday) {
                                MessageBox.error(oBundle.getText("startDatePastError"));
                                return;
                            }
                        }

                        if (dStart && dEnd) {
                            var dStartCompare = new Date(dStart.getTime());
                            dStartCompare.setHours(0, 0, 0, 0);
                            var dEndCompare = new Date(dEnd.getTime());
                            dEndCompare.setHours(0, 0, 0, 0);

                            if (dEndCompare <= dStartCompare) {
                                MessageBox.error(oBundle.getText("endDateBeforeStartError"));
                                return;
                            }
                        }

                        var toUTC = function (d) {
                            if (!d) return null;
                            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        };

                        var oPayload = {
                            ProjectCode: sCode,
                            ProjectName: sName,
                            ProjectType: oComboType.getValue().trim() || oComboType.getSelectedKey(),
                            StartDate: toUTC(oPickerStart.getDateValue()),
                            EndDate: toUTC(oPickerEnd.getDateValue()),
                            Status: oSelectStatus.getSelectedKey()
                        };
                        if (bEdit) {
                            var sUpdatePath = that._getProjectEntityPath(oContext);
                            if (!sUpdatePath) {
                                MessageBox.error(oBundle.getText("projectPathError"));
                                return;
                            }
                            oModel.update(sUpdatePath, oPayload, {
                                success: function () {
                                    MessageToast.show(oBundle.getText("projectUpdatedSuccess"));
                                    that._readProjects("");
                                    that._loadProjectValueHelps();
                                    oDialog.close();
                                },
                                error: function () { MessageBox.error(oBundle.getText("errorUpdatingProject")); }
                            });
                        } else {
                            oModel.create("/ProjectSet", oPayload, {
                                success: function () {
                                    MessageToast.show(oBundle.getText("projectCreatedSuccess"));
                                    that._readProjects("");
                                    that._loadProjectValueHelps();
                                    oDialog.close();
                                },
                                error: function () { MessageBox.error(oBundle.getText("errorCreatingProject")); }
                            });
                        }
                    }
                }),
                endButton: new Button({
                    text: oBundle.getText("cancel"),
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.addStyleClass("sapUiContentPadding");
            oDialog.open();
        }
    });
});