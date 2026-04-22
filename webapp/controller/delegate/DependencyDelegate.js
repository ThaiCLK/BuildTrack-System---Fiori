sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], function (Filter, FilterOperator, JSONModel) {
    "use strict";

    var DependencyDelegate = {

        /* =========================================================== */
        /* INIT                                                        */
        /* =========================================================== */

        init: function (oController) {
            oController._loadDependencies = this._loadDependencies.bind(oController);
            oController.onAddDependency = this.onAddDependency.bind(oController);
            oController.onConfirmAddDependency = this.onConfirmAddDependency.bind(oController);
            oController.onCancelAddDependency = this.onCancelAddDependency.bind(oController);
            oController.onDeleteDependency = this.onDeleteDependency.bind(oController);
            oController.formatDepType = this.formatDepType.bind(oController);
            oController.formatDepTypeState = this.formatDepTypeState.bind(oController);
            oController.validateDependencyOnRun = this.validateDependencyOnRun.bind(oController);
            oController.validateDependencyOnClose = this.validateDependencyOnClose.bind(oController);

            // Local model for dependency list
            var oDepModel = new JSONModel({ dependencies: [], allWbs: [] });
            oController.getView().setModel(oDepModel, "dependencyModel");
        },

        /* =========================================================== */
        /* LOAD                                                        */
        /* =========================================================== */

        /**
         * Load all dependencies where this WBS is the successor (WbsId = current WBS).
         * Then enrich each record with predecessor WbsCode + WbsName by reading WBSSet.
         */
        _loadDependencies: function (sWbsId) {
            var oView = this.getView();
            var oModel = this.getOwnerComponent().getModel();
            var oDepModel = oView.getModel("dependencyModel");

            if (!sWbsId) { return; }

            oModel.read("/WBSSet(guid'" + sWbsId + "')/ToDependencies", {
                success: function (oData) {
                    var aDeps = oData.results || [];

                    if (aDeps.length === 0) {
                        oDepModel.setProperty("/dependencies", []);
                        return;
                    }

                    // Enrich: fetch predecessor WBS details
                    var iDone = 0;
                    aDeps.forEach(function (oDep) {
                        var sPredId = oDep.DepWbsId;
                        oModel.read("/WBSSet(guid'" + sPredId + "')", {
                            success: function (oPred) {
                                oDep.PredWbsCode = oPred.WbsCode || "";
                                oDep.PredWbsName = oPred.WbsName || "";
                                oDep.PredStatus = oPred.Status || "";
                                iDone++;
                                if (iDone === aDeps.length) {
                                    oDepModel.setProperty("/dependencies", aDeps);
                                }
                            },
                            error: function () {
                                oDep.PredWbsCode = sPredId;
                                oDep.PredWbsName = "";
                                oDep.PredStatus = "";
                                iDone++;
                                if (iDone === aDeps.length) {
                                    oDepModel.setProperty("/dependencies", aDeps);
                                }
                            }
                        });
                    });
                },
                error: function () {
                    oDepModel.setProperty("/dependencies", []);
                }
            });
        },

        /* =========================================================== */
        /* ADD DEPENDENCY                                              */
        /* =========================================================== */

        onAddDependency: function () {
            var oView = this.getView();
            // Permission check: ZBT_DEPENDENCIES — AuthLevel 1 or 99
            var oUserModel = oView.getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            if (iAuthLevel !== 1 && iAuthLevel !== 99) {
                sap.m.MessageBox.error(oView.getModel("i18n").getResourceBundle().getText("dependencyPermissionError"));
                return;
            }

            var oModel = this.getOwnerComponent().getModel();
            var oDepModel = oView.getModel("dependencyModel");
            var sCurrentWbsId = this._sWbsId;
            var that = this;

            var oCtx = oView.getBindingContext();
            if (!oCtx) {
                sap.m.MessageToast.show("Cannot determine WBS context.");
                return;
            }

            var sSiteId = oCtx.getProperty("SiteId");
            // ParentId may arrive as string GUID or null
            var sParentId = oCtx.getProperty("ParentId") || null;

            if (!sSiteId) {
                sap.m.MessageToast.show("Cannot determine site context.");
                return;
            }

            // Normalize GUID strings to lowercase for safe comparison
            var fnNorm = function (s) { return s ? s.toLowerCase().replace(/[{}]/g, "") : null; };
            var sNormParent = fnNorm(sParentId);
            var sNormCurrent = fnNorm(sCurrentWbsId);

            // Read all WBS for this site directly (avoids navigation path issues)
            oModel.read("/WBSSet", {
                urlParameters: {
                    "$filter": "SiteId eq guid'" + sSiteId + "'"
                },
                success: function (oData) {
                    var aAll = oData.results || [];

                    var mParents = {};
                    aAll.forEach(function (w) {
                        if (w.ParentId) {
                            mParents[fnNorm(w.ParentId)] = true;
                        }
                    });

                    var isLeaf = function (id) {
                        return !mParents[fnNorm(id)];
                    };

                    var aExistingDeps = oDepModel.getProperty("/dependencies") || [];
                    var mExistingDeps = {};
                    aExistingDeps.forEach(function (d) {
                        if (d.DepWbsId) {
                            mExistingDeps[fnNorm(d.DepWbsId)] = true;
                        }
                    });

                    var aFiltered = aAll.filter(function (w) {
                        var bSelf = fnNorm(w.WbsId) === sNormCurrent;
                        var bSameSite = fnNorm(w.SiteId) === fnNorm(sSiteId);
                        var bAlreadyAdded = mExistingDeps[fnNorm(w.WbsId)];

                        if (bSelf || !bSameSite || bAlreadyAdded) return false;

                        // Only show leaf WBS (no children) across the entire site
                        return isLeaf(w.WbsId);
                    });

                    oDepModel.setProperty("/allWbs", aFiltered);

                    var sInitialWbsId = (aFiltered && aFiltered.length > 0) ? aFiltered[0].WbsId : "";
                    oDepModel.setProperty("/newDep", {
                        DepWbsId: sInitialWbsId,
                        DepType: "FS"
                    });

                    if (!that._pAddDepDialog) {
                        that._pAddDepDialog = sap.ui.core.Fragment.load({
                            id: oView.getId(),
                            name: "z.bts.buildtrack551.view.fragments.AddDependencyDialog",
                            controller: that
                        }).then(function (oDialog) {
                            oView.addDependent(oDialog);
                            return oDialog;
                        });
                    }

                    that._pAddDepDialog.then(function (oDialog) {
                        oDialog.open();
                    });
                },
                error: function () {
                    sap.m.MessageToast.show("Cannot load WBS list.");
                }
            });
        },


        onConfirmAddDependency: function () {
            var oView = this.getView();
            var oModel = this.getOwnerComponent().getModel();
            var oDepModel = oView.getModel("dependencyModel");
            var oNewDep = oDepModel.getProperty("/newDep");
            var sCurrentWbsId = this._sWbsId;
            var that = this;
            var oBundle = oView.getModel("i18n").getResourceBundle();

            // Validate
            if (!oNewDep.DepWbsId) {
                sap.m.MessageBox.error(oBundle.getText("depPredecessorRequired"));
                return;
            }
            if (!oNewDep.DepType) {
                sap.m.MessageBox.error(oBundle.getText("depTypeRequired"));
                return;
            }
            if (oNewDep.DepWbsId === sCurrentWbsId) {
                sap.m.MessageBox.error(oBundle.getText("depSelfDependencyError"));
                return;
            }

            var oPayload = {
                WbsId: sCurrentWbsId,
                DepWbsId: oNewDep.DepWbsId,
                DepType: oNewDep.DepType
            };

            oView.setBusy(true);
            oModel.create("/DependencySet", oPayload, {
                success: function () {
                    oView.setBusy(false);
                    sap.m.MessageToast.show(oBundle.getText("depAddedSuccess"));
                    that.onCancelAddDependency();
                    that._loadDependencies(sCurrentWbsId);
                },
                error: function (oError) {
                    oView.setBusy(false);
                    var sMsg = oBundle.getText("depAddError");
                    try {
                        var oErr = JSON.parse(oError.responseText);
                        sMsg = (oErr.error && oErr.error.message && oErr.error.message.value) || sMsg;
                    } catch (e) { }
                    sap.m.MessageBox.error(sMsg);
                }
            });
        },

        onCancelAddDependency: function () {
            if (this._pAddDepDialog) {
                this._pAddDepDialog.then(function (oDialog) { oDialog.close(); });
            }
        },

        /* =========================================================== */
        /* DELETE DEPENDENCY                                           */
        /* =========================================================== */

        onDeleteDependency: function (oEvent) {
            var that = this;
            var oBtn = oEvent.getSource();
            var oCtx = oBtn.getBindingContext("dependencyModel");
            var oDep = oCtx.getObject();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            // Permission check: ZBT_DEPENDENCIES — AuthLevel 1 or 99
            var oUserModel = this.getView().getModel("userModel");
            var iAuthLevel = oUserModel ? parseInt(oUserModel.getProperty("/authLevel"), 10) : -1;
            if (iAuthLevel !== 1 && iAuthLevel !== 99) {
                sap.m.MessageBox.error(oBundle.getText("dependencyPermissionError"));
                return;
            }
            var oModel = this.getOwnerComponent().getModel();

            sap.m.MessageBox.confirm(
                oBundle.getText("depDeleteConfirm", [oDep.PredWbsCode || oDep.DepWbsId]),
                {
                    onClose: function (sAction) {
                        if (sAction !== sap.m.MessageBox.Action.OK) { return; }
                        var sPath = oModel.createKey("/DependencySet", oDep);
                        that.getView().setBusy(true);
                        oModel.remove(sPath, {
                            success: function () {
                                that.getView().setBusy(false);
                                sap.m.MessageToast.show(oBundle.getText("depDeletedSuccess"));
                                that._loadDependencies(that._sWbsId);
                            },
                            error: function () {
                                that.getView().setBusy(false);
                                sap.m.MessageBox.error(oBundle.getText("depDeleteError"));
                            }
                        });
                    }
                }
            );
        },

        /* =========================================================== */
        /* VALIDATION                                                  */
        /* =========================================================== */

        /**
         * Validates FS and SS dependencies before transitioning to IN_PROGRESS.
         * Returns a Promise that resolves if OK, rejects with message if blocked.
         */
        validateDependencyOnRun: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            return new Promise(function (resolve, reject) {
                oModel.read("/WBSSet(guid'" + sWbsId + "')/ToDependencies", {
                    success: function (oData) {
                        var aDeps = (oData.results || []).filter(function (d) {
                            return d.DepType === "FS" || d.DepType === "SS";
                        });

                        if (aDeps.length === 0) { resolve(); return; }

                        var iDone = 0;
                        var aViolations = [];

                        aDeps.forEach(function (oDep) {
                            oModel.read("/WBSSet(guid'" + oDep.DepWbsId + "')", {
                                success: function (oPred) {
                                    if (oDep.DepType === "FS" && oPred.Status !== "CLOSED") {
                                        aViolations.push(
                                            oBundle.getText("depFSViolation", [oPred.WbsCode || oDep.DepWbsId])
                                        );
                                    } else if (oDep.DepType === "SS" &&
                                        oPred.Status !== "IN_PROGRESS" &&
                                        oPred.Status !== "PENDING_CLOSE" &&
                                        oPred.Status !== "CLOSED") {
                                        aViolations.push(
                                            oBundle.getText("depSSViolation", [oPred.WbsCode || oDep.DepWbsId])
                                        );
                                    }
                                    iDone++;
                                    if (iDone === aDeps.length) {
                                        if (aViolations.length > 0) {
                                            reject(aViolations.join("\n"));
                                        } else {
                                            resolve();
                                        }
                                    }
                                },
                                error: function () {
                                    iDone++;
                                    if (iDone === aDeps.length) {
                                        aViolations.length > 0 ? reject(aViolations.join("\n")) : resolve();
                                    }
                                }
                            });
                        });
                    },
                    error: function () { resolve(); } // On read error, allow the action
                });
            });
        },

        /**
         * Validates FF and SF dependencies before submitting close approval.
         * Returns a Promise that resolves if OK, rejects with message if blocked.
         */
        validateDependencyOnClose: function (sWbsId) {
            var oModel = this.getOwnerComponent().getModel();
            var oBundle = this.getView().getModel("i18n").getResourceBundle();

            return new Promise(function (resolve, reject) {
                oModel.read("/WBSSet(guid'" + sWbsId + "')/ToDependencies", {
                    success: function (oData) {
                        var aDeps = (oData.results || []).filter(function (d) {
                            return d.DepType === "FF" || d.DepType === "SF";
                        });

                        if (aDeps.length === 0) { resolve(); return; }

                        var iDone = 0;
                        var aViolations = [];

                        aDeps.forEach(function (oDep) {
                            oModel.read("/WBSSet(guid'" + oDep.DepWbsId + "')", {
                                success: function (oPred) {
                                    if (oDep.DepType === "FF" && oPred.Status !== "CLOSED") {
                                        aViolations.push(
                                            oBundle.getText("depFFViolation", [oPred.WbsCode || oDep.DepWbsId])
                                        );
                                    } else if (oDep.DepType === "SF" &&
                                        oPred.Status !== "IN_PROGRESS" &&
                                        oPred.Status !== "PENDING_CLOSE" &&
                                        oPred.Status !== "CLOSED") {
                                        aViolations.push(
                                            oBundle.getText("depSFViolation", [oPred.WbsCode || oDep.DepWbsId])
                                        );
                                    }
                                    iDone++;
                                    if (iDone === aDeps.length) {
                                        aViolations.length > 0 ? reject(aViolations.join("\n")) : resolve();
                                    }
                                },
                                error: function () {
                                    iDone++;
                                    if (iDone === aDeps.length) {
                                        aViolations.length > 0 ? reject(aViolations.join("\n")) : resolve();
                                    }
                                }
                            });
                        });
                    },
                    error: function () { resolve(); }
                });
            });
        },

        /* =========================================================== */
        /* FORMATTERS                                                  */
        /* =========================================================== */

        formatDepType: function (sType) {
            var oBundle = this.getView().getModel("i18n").getResourceBundle();
            var m = {
                "FS": oBundle.getText("depTypeFS"),
                "SS": oBundle.getText("depTypeSS"),
                "FF": oBundle.getText("depTypeFF"),
                "SF": oBundle.getText("depTypeSF")
            };
            return m[sType] || sType;
        },

        formatDepTypeState: function (sType) {
            var m = { "FS": "Error", "SS": "Warning", "FF": "Information", "SF": "Success" };
            return m[sType] || "None";
        }
    };

    return DependencyDelegate;
});
