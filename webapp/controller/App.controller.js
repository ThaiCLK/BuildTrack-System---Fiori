sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast"
], (BaseController, Fragment, JSONModel, MessageToast) => {
  "use strict";

  return BaseController.extend("z.bts.buildtrack551.controller.App", {
      onInit() {
          this.getView().setModel(new JSONModel({
              draft: "",
              isBusy: false,
              messages: [
                  this._createMessage(
                      "assistant",
                      "Xin chào, tôi là BuildTrack Assistant. Bạn có thể hỏi cách sử dụng màn hình Dashboard, Project, Site hoặc WBS.",
                      []
                  )
              ]
          }), "assistant");
      },
      onNavToDashboard: function () {
          this.getOwnerComponent().getRouter().navTo("Dashboard");
      },
      _getAssistantModel: function () {
          return this.getView().getModel("assistant");
      },
      _createMessage: function (role, text, citations) {
          var now = new Date();
          return {
              role: role,
              sender: role === "user" ? "Bạn" : "BuildTrack Assistant",
              icon: role === "user" ? "sap-icon://customer" : "sap-icon://discussion-2",
              text: text,
              citations: citations || [],
              time: now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
          };
      },
      _appendMessage: function (role, text, citations) {
          var oModel = this._getAssistantModel();
          var aMessages = oModel.getProperty("/messages") || [];
          aMessages.push(this._createMessage(role, text, citations));
          oModel.setProperty("/messages", aMessages);
      },
      onOpenAssistant: function () {
          if (this._oAssistantDialog) {
              this._oAssistantDialog.open();
              return;
          }

          Fragment.load({
              // Do not pass a fixed id here to avoid global ID collisions in app-preview reload cycles.
              name: "z.bts.buildtrack551.view.fragments.AssistantDialog",
              controller: this
          })
              .then(function (oDialog) {
                  this._oAssistantDialog = oDialog;
                  this.getView().addDependent(oDialog);
                  oDialog.open();
              }.bind(this))
              .catch(function (error) {
                  MessageToast.show("Không mở được Assistant. Vui lòng kiểm tra cấu hình fragment.");
                  console.error("Assistant dialog load failed:", error);
                  this._oAssistantDialog = null;
              }.bind(this));
      },
      _buildChatHistory: function (aMessages) {
          return aMessages.slice(-8).map(function (oMessage) {
              return {
                  role: oMessage.role,
                  text: oMessage.text
              };
          });
      },
      _formatAssistantText: function (sAnswer, aCitations) {
          return sAnswer;
      },
      _sendAssistantQuestion: async function (sQuestion) {
          var oModel = this._getAssistantModel();
          var sText = (sQuestion || "").trim();

          if (!sText || oModel.getProperty("/isBusy")) {
              return;
          }

          var aCurrentMessages = oModel.getProperty("/messages") || [];
          oModel.setProperty("/isBusy", true);
          oModel.setProperty("/draft", "");
          this._appendMessage("user", sText, []);

          try {
              var response = await fetch("/rag/api/chat", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                      question: sText,
                      history: this._buildChatHistory(aCurrentMessages)
                  })
              });

              var data = await response.json();
              if (!response.ok || !data.ok) {
                  throw new Error(data.error || "RAG server error");
              }

              this._appendMessage(
                  "assistant",
                  this._formatAssistantText(data.answer, data.citations),
                  data.citations || []
              );
          } catch (error) {
              var sErrorText = error && error.message ? error.message : "Không xác định";
              this._appendMessage(
                  "assistant",
                  "BuildTrack Assistant tạm thời lỗi. Chi tiết: " + sErrorText,
                  []
              );
              MessageToast.show(sErrorText);
          } finally {
              oModel.setProperty("/isBusy", false);
          }
      },
      onAssistantSend: function () {
          var oModel = this._getAssistantModel();
          this._sendAssistantQuestion(oModel.getProperty("/draft"));
      },
      onAssistantSuggestionPress: function (oEvent) {
          var sQuestion = oEvent.getSource().getText();
          this._sendAssistantQuestion(sQuestion);
      },
      onAssistantReindex: async function () {
          var oModel = this._getAssistantModel();
          if (oModel.getProperty("/isBusy")) {
              return;
          }

          oModel.setProperty("/isBusy", true);
          try {
              var response = await fetch("/rag/api/reindex", { method: "POST" });
              var data = await response.json();

              if (!response.ok || !data.ok) {
                  throw new Error(data.error || "Reindex failed");
              }

              MessageToast.show("Đã cập nhật tri thức BuildTrack");
          } catch (error) {
              MessageToast.show(error.message);
          } finally {
              oModel.setProperty("/isBusy", false);
          }
      },
      onPressProfile: function (oEvent) {
          var oButton = oEvent.getSource();
          if (this._oProfilePopover) {
              this._oProfilePopover.openBy(oButton);
              return;
          }

          Fragment.load({
              name: "z.bts.buildtrack551.view.fragments.ProfilePopover",
              controller: this
          }).then(function (oPopover) {
              this._oProfilePopover = oPopover;
              this.getView().addDependent(oPopover);
              oPopover.openBy(oButton);
          }.bind(this));
      },
      onCloseProfile: function () {
          if (this._oProfilePopover) {
              this._oProfilePopover.close();
          }
      },
      onCloseAssistant: function () {
          if (this._oAssistantDialog) {
              this._oAssistantDialog.close();
          }
      },
      onExit: function () {
          if (this._oAssistantDialog) {
              this._oAssistantDialog.destroy();
              this._oAssistantDialog = null;
          }
          if (this._oProfilePopover) {
              this._oProfilePopover.destroy();
              this._oProfilePopover = null;
          }
      }
  });
});