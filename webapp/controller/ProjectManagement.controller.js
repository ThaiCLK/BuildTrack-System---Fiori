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
            this._fetchUserRoles(); // Fetch users for ID -> Name mapping
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
                    status: "status",
                    createdBy: "created_by"
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
                Status: oRow.Status || oRow.status || "",
                CreatedBy: oRow.CreatedBy || oRow.created_by || ""
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

        _fetchUserRoles: function () {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            if (!oModel) return;

            oModel.read("/UserRoleSet", {
                success: function (oData) {
                    var aUsers = (oData && oData.results) ? oData.results : [];
                    var mUserMap = {};
                    aUsers.forEach(function (u) {
                        mUserMap[u.UserId] = u.UserName || u.UserId;
                    });
                    
                    // Store in a local model for easy access
                    that.getView().setModel(new JSONModel({
                        map: mUserMap,
                        list: aUsers
                    }), "users");

                    // Re-enrich projects if they are already loaded
                    var oPmModel = that.getView().getModel("pm");
                    var aProjects = oPmModel.getProperty("/projects") || [];
                    if (aProjects.length > 0) {
                        that._enrichProjectWithNames(aProjects);
                        oPmModel.setProperty("/projects", aProjects);
                    }
                },
                error: function () {
                    console.error("Failed to fetch UserRoleSet for name mapping");
                }
            });
        },

        _enrichProjectWithNames: function (aProjects) {
            var oUsersModel = this.getView().getModel("users");
            if (!oUsersModel) return;
            
            var mUserMap = oUsersModel.getProperty("/map") || {};
            aProjects.forEach(function (p) {
                if (p.CreatedBy) {
                    p.CreatedByName = mUserMap[p.CreatedBy] || p.CreatedBy;
                } else {
                    p.CreatedByName = "";
                }
            });
        },

        _readProjects: function (sFilterExpr) {
            var oModel = this.getOwnerComponent().getModel();
            var oPmModel = this.getView().getModel("pm");
            var that = this;
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
                    
                    // Enrich with Names
                    this._enrichProjectWithNames(aNormalized);

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
            var sKey = (sType || "").toUpperCase();
            var mIcons = {
                "ROAD": "sap-icon://car-rental",
                "ĐƯỜNG BỘ": "sap-icon://car-rental",
                "BRIDGE": "sap-icon://functional-location",
                "CẦU": "sap-icon://functional-location",
                "BUILDING": "sap-icon://building",
                "TÒA NHÀ": "sap-icon://building",
                "TOÀ NHÀ": "sap-icon://building",
                "TUNNEL": "sap-icon://passenger-train",
                "HẦM": "sap-icon://passenger-train"
            };
            return mIcons[sKey] || "sap-icon://tag";
        },

        formatTypeState: function (sType) {
            return "None";
        },

        formatTypeText: function (sType) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sKey = (sType || "").toUpperCase();
            var mLabels = {
                "ROAD": oBundle.getText("typeRoad"),
                "ĐƯỜNG BỘ": oBundle.getText("typeRoad"),
                "BRIDGE": oBundle.getText("typeBridge"),
                "CẦU": oBundle.getText("typeBridge"),
                "BUILDING": oBundle.getText("typeBuilding"),
                "TÒA NHÀ": oBundle.getText("typeBuilding"),
                "TOÀ NHÀ": oBundle.getText("typeBuilding"),
                "TUNNEL": oBundle.getText("typeTunnel"),
                "HẦM": oBundle.getText("typeTunnel"),
                "OTHER": oBundle.getText("typeOther"),
                "LOẠI KHÁC": oBundle.getText("typeOther"),
                "KHÁC": oBundle.getText("typeOther")
            };
            return mLabels[sKey] || sType;
        },

        formatStatusText: function (sStatus) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var mLabels = {
                "PLANNING": oBundle.getText("planningStatus"),
                "IN_PROGRESS": oBundle.getText("inProgressStatus"),
                "CLOSED": oBundle.getText("closedStatus")
            };
            return mLabels[(sStatus || "").toUpperCase()] || sStatus;
        },

        onDatePickerAfterRendering: function(oEvent) {
            var $input = oEvent.getSource().$().find("input");
            if ($input.length > 0) {
                $input.attr("readonly", true);
                $input.css("cursor", "pointer");
            }
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
            // Map localized text or common labels to standard keys for precise OData filtering
            var sTypeUpper = sType.toUpperCase();
            var mFilterMap = {
                "ROAD": "ROAD", "ĐƯỜNG BỘ": "ROAD",
                "BRIDGE": "BRIDGE", "CẦU": "BRIDGE",
                "BUILDING": "BUILDING", "TÒA NHÀ": "BUILDING", "TOÀ NHÀ": "BUILDING",
                "TUNNEL": "TUNNEL", "HẦM": "TUNNEL",
                "OTHER": "OTHER", "LOẠI KHÁC": "OTHER", "KHÁC": "OTHER"
            };
            if (mFilterMap[sTypeUpper]) {
                sType = mFilterMap[sTypeUpper];
            }

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
            var sStatus = oContext.getProperty("Status");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (sStatus !== "PLANNING") {
                MessageBox.error(oBundle.getText("editOnlyPlanningError"));
                return;
            }

            if (!this._checkProjectPermission(oContext)) {
                MessageBox.error(oBundle.getText("permissionError"));
                return;
            }

            this._openProjectDialog(oContext);
        },

        // ── DELETE ────────────────────────────────────────────────────────────
        onDeleteProject: function (oEvent) {
            var that = this;
            var oContext = oEvent.getSource().getBindingContext("pm") || oEvent.getSource().getBindingContext();
            var sStatus = oContext.getProperty("Status");
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            if (sStatus !== "PLANNING") {
                MessageBox.error(oBundle.getText("deleteOnlyPlanningError"));
                return;
            }

            if (!this._checkProjectPermission(oContext)) {
                MessageBox.error(oBundle.getText("permissionError"));
                return;
            }

            var sName = oContext.getProperty("ProjectName");
            var sPath = this._getProjectEntityPath(oContext);
            var oModel = this.getOwnerComponent().getModel();

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

        _checkProjectPermission: function (oContext) {
            var oUserModel = this.getView().getModel("userModel");
            if (!oUserModel) {
                return false;
            }

            var sCurrentUser = oUserModel.getProperty("/userId");
            var iAuthLevel = oUserModel.getProperty("/authLevel");
            
            // Allow if System Admin (99)
            if (iAuthLevel === 99) {
                return true;
            }

            var sCreatedBy = oContext.getProperty("CreatedBy") || oContext.getProperty("created_by");
            
            // Allow if Project Creator
            return sCurrentUser === sCreatedBy;
        },

        // ── PRIVATE: Create/Edit Project Dialog ──────────────────────────────
        _openProjectDialog: function (oContext) {
            var that = this;
            var bEdit = !!oContext;
            var oModel = this.getOwnerComponent().getModel();

            var oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            var oInputCode = new Input({
                placeholder: oBundle.getText("projectCodePlaceholder"),
                editable: false, // Always read-only as per new requirement
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValue(oSource.getValue().toUpperCase());
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            var oInputName = new Input({
                placeholder: oBundle.getText("projectNamePlaceholder"),
                liveChange: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
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
                ],
                change: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            var dToday = new Date();
            dToday.setHours(0, 0, 0, 0);

            var oPickerStart = new DatePicker({
                width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd",
                change: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });
            var oPickerEnd = new DatePicker({
                width: "100%", displayFormat: "dd/MM/yyyy", valueFormat: "yyyy-MM-dd",
                change: function (oEvent) {
                    var oSource = oEvent.getSource();
                    oSource.setValueState("None");
                    oSource.setValueStateText("");
                }
            });

            // Ensure no typing/cursor by making internal input readonly
            var fnSetReadOnly = function () {
                var $input = this.$().find("input");
                if ($input.length > 0) {
                    $input.attr("readonly", true);
                    $input.css("cursor", "pointer"); // Make it look clickable
                }
            };
            oPickerStart.addEventDelegate({ onAfterRendering: fnSetReadOnly }, oPickerStart);
            oPickerEnd.addEventDelegate({ onAfterRendering: fnSetReadOnly }, oPickerEnd);

            oPickerStart.attachChange(function (oEvent) {
                // When Start Date changes, we just clear states. 
                // We no longer setMinDate to allow the user to 'attempt' any date 
                // and see our custom error message instead of the generic UI5 minDate error.
                var dStart = oPickerStart.getDateValue();
                var dEnd = oPickerEnd.getDateValue();
                if (dStart && dEnd && dEnd <= dStart) {
                    oPickerEnd.setValueState("Error");
                    oPickerEnd.setValueStateText(oBundle.getText("endDateBeforeStartError"));
                } else {
                    oPickerEnd.setValueState("None");
                }
            });

            oPickerEnd.attachChange(function (oEvent) {
                var dStart = oPickerStart.getDateValue();
                var dEnd = oPickerEnd.getDateValue();
                if (dStart && dEnd && dEnd <= dStart) {
                    oPickerEnd.setValueState("Error");
                    oPickerEnd.setValueStateText(oBundle.getText("endDateBeforeStartError"));
                } else {
                    oPickerEnd.setValueState("None");
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
                var sRawType = oContext.getProperty("ProjectType") || "";
                var sTypeUpper = sRawType.toUpperCase();
                // Map labels/keys to standard keys for the ComboBox selection
                var mLabelToKey = {
                    "ROAD": "ROAD", "ĐƯỜNG BỘ": "ROAD",
                    "BRIDGE": "BRIDGE", "CẦU": "BRIDGE",
                    "BUILDING": "BUILDING", "TÒA NHÀ": "BUILDING", "TOÀ NHÀ": "BUILDING",
                    "TUNNEL": "TUNNEL", "HẦM": "TUNNEL",
                    "OTHER": "OTHER", "LOẠI KHÁC": "OTHER", "KHÁC": "OTHER"
                };
                var sKey = mLabelToKey[sTypeUpper];
                
                if (sKey) {
                    // Standard type found: set selected key to get translation
                    oComboType.setSelectedKey(sKey);
                } else {
                    // Custom type: ensure no key is selected and set raw value text
                    oComboType.setSelectedKey(null);
                    oComboType.setValue(sRawType);
                }
                oSelectStatus.setSelectedKey(oContext.getProperty("Status"));
                var oStart = oContext.getProperty("StartDate");
                var oEnd = oContext.getProperty("EndDate");
                
                if (oStart) {
                    oPickerStart.setDateValue(oStart);
                }
                
                if (oEnd) {
                    oPickerEnd.setDateValue(oEnd);
                }
            }

            var aFormContent = [];
            if (bEdit) {
                aFormContent.push(new Label({ text: oBundle.getText("projectCode"), required: true }));
                aFormContent.push(oInputCode);
            }
            aFormContent.push(new Label({ text: oBundle.getText("projectName"), required: true }));
            aFormContent.push(oInputName);
            aFormContent.push(new Label({ text: oBundle.getText("projectType"), required: true }));
            aFormContent.push(oComboType);
            aFormContent.push(new Label({ text: oBundle.getText("startDate"), required: true }));
            aFormContent.push(oPickerStart);
            aFormContent.push(new Label({ text: oBundle.getText("estEndDate"), required: true }));
            aFormContent.push(oPickerEnd);

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
                        // Reset all value states first
                        oInputCode.setValueState("None");
                        oInputCode.setValueStateText("");
                        oInputName.setValueState("None");
                        oInputName.setValueStateText("");
                        oComboType.setValueState("None");
                        oComboType.setValueStateText("");
                        oPickerStart.setValueState("None");
                        oPickerStart.setValueStateText("");
                        oPickerEnd.setValueState("None");
                        oPickerEnd.setValueStateText("");

                        var bHasError = false;

                        var sCode = oInputCode.getValue().trim();
                        var sName = oInputName.getValue().trim();

                        if (bEdit && !sCode) {
                            oInputCode.setValueState("Error");
                            oInputCode.setValueStateText(oBundle.getText("requireProjectCode"));
                            bHasError = true;
                        }

                        if (!sName) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("requireProjectName"));
                            bHasError = true;
                        }

                        var sType = oComboType.getSelectedKey() || oComboType.getValue().trim();
                        if (!sType) {
                            oComboType.setValueState("Error");
                            oComboType.setValueStateText(oBundle.getText("missingProjectType"));
                            bHasError = true;
                        }

                        if (!oPickerStart.getDateValue()) {
                            oPickerStart.setValueState("Error");
                            oPickerStart.setValueStateText(oBundle.getText("missingStartDate"));
                            bHasError = true;
                        } else if (!oPickerStart.isValidValue()) {
                            oPickerStart.setValueState("Error");
                            oPickerStart.setValueStateText(oBundle.getText("invalidDateError") || "Invalid date format.");
                            bHasError = true;
                        }

                        if (!oPickerEnd.getDateValue()) {
                            oPickerEnd.setValueState("Error");
                            oPickerEnd.setValueStateText(oBundle.getText("missingEndDate") || "Missing end date.");
                            bHasError = true;
                        } else if (!oPickerEnd.isValidValue()) {
                            oPickerEnd.setValueState("Error");
                            oPickerEnd.setValueStateText(oBundle.getText("invalidDateError") || "Invalid date format.");
                            bHasError = true;
                        }

                        var dStart = oPickerStart.getDateValue();
                        var dEnd = oPickerEnd.getDateValue();



                        if (dStart && dEnd && oPickerStart.isValidValue() && oPickerEnd.isValidValue()) {
                            var dStartCompare = new Date(dStart.getTime());
                            dStartCompare.setHours(0, 0, 0, 0);
                            var dEndCompare = new Date(dEnd.getTime());
                            dEndCompare.setHours(0, 0, 0, 0);

                            if (dEndCompare <= dStartCompare) {
                                oPickerEnd.setValueState("Error");
                                oPickerEnd.setValueStateText(oBundle.getText("endDateBeforeStartError"));
                                bHasError = true;
                            }
                        }

                        // Duplicate Name Check
                        var aProjects = that.getView().getModel("pm").getProperty("/projects") || [];
                        var bNameExists = aProjects.some(function (p) {
                            return p.ProjectName && p.ProjectName.trim().toLowerCase() === sName.toLowerCase() && p.ProjectCode !== sCode;
                        });
                        if (bNameExists) {
                            oInputName.setValueState("Error");
                            oInputName.setValueStateText(oBundle.getText("projectNameExistsError") || "Project name already exists.");
                            bHasError = true;
                        }

                        if (bHasError) {
                            return;
                        }

                        var toUTC = function (d) {
                            if (!d) return null;
                            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                        };

                        var oPayload = {
                            ProjectName: sName,
                            ProjectType: oComboType.getSelectedKey() || oComboType.getValue().trim(),
                            StartDate: toUTC(oPickerStart.getDateValue()),
                            EndDate: toUTC(oPickerEnd.getDateValue()),
                            Status: oSelectStatus.getSelectedKey()
                        };

                        if (bEdit) {
                            oPayload.ProjectCode = sCode;
                        }

                        var fnDoSave = function () {
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
                                    error: function (oError) { that._showError(oError, "errorUpdatingProject"); }
                                });
                            } else {
                                oModel.create("/ProjectSet", oPayload, {
                                    success: function () {
                                        MessageToast.show(oBundle.getText("projectCreatedSuccess"));
                                        that._readProjects("");
                                        that._loadProjectValueHelps();
                                        oDialog.close();
                                    },
                                    error: function (oError) { that._showError(oError, "errorCreatingProject"); }
                                });
                            }
                        };

                        var sTypeKey = oComboType.getSelectedKey() || "";
                        var sTypeValue = oComboType.getValue().trim();
                        var aStandardKeys = ["ROAD", "BRIDGE", "BUILDING", "TUNNEL"];
                        
                        if (aStandardKeys.indexOf(sTypeKey.toUpperCase()) === -1 && sTypeValue) {
                            MessageBox.confirm(oBundle.getText("customTypeConfirm", [sTypeValue]), {
                                title: oBundle.getText("confirmSaveTitle"),
                                onClose: function (oAction) {
                                    if (oAction === MessageBox.Action.OK) {
                                        fnDoSave();
                                    }
                                }
                            });
                        } else {
                            fnDoSave();
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
        },

        _showError: function (oError, sDefaultI18nKey) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var sMsg = sDefaultI18nKey ? (oBundle.getText(sDefaultI18nKey) || "Action failed.") : "System error occurred.";

            try {
                if (oError && oError.responseText) {
                    var oErr = JSON.parse(oError.responseText);
                    if (oErr.error && oErr.error.message && oErr.error.message.value) {
                        sMsg = oErr.error.message.value;
                    } else if (oErr.error && oErr.error.innererror && oErr.error.innererror.errordetails && oErr.error.innererror.errordetails.length > 0) {
                        sMsg = oErr.error.innererror.errordetails[0].message;
                    }
                } else if (oError && oError.message) {
                    sMsg = oError.message;
                }
            } catch (e) {
                // Keep default
            }

            MessageBox.error(sMsg);
        }
    });
});