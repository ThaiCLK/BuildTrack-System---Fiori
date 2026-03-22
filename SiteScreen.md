@AbapCatalog.sqlViewName: 'ZV_BTSITE_C'
@EndUserText.label: 'BuildTrack Site'
@OData.publish: true
@Search.searchable: true

@UI.presentationVariant: [{
    sortOrder: [{
        by: 'site_code',
        direction: #ASC
    }]
}]

define view ZC_BT_SITE
  as select from ZCDS_BT_SITE
{
    key site_id,

    // 🔍 SEARCH
    @Search.defaultSearchElement: true
    @UI.lineItem: [{ position: 10 }]
    site_code,

    @Search.defaultSearchElement: true
    @UI.lineItem: [{ position: 20 }]
    site_name,

    // 🎛 FILTER + DISPLAY
    @UI.selectionField: [{ position: 10 }]
    @UI.lineItem: [{ position: 30 }]
    status,

    @UI.lineItem: [{ position: 40 }]
    address,

    // (optional hiển thị project)
    @UI.lineItem: [{ position: 50 }]
    project_id
}

@AbapCatalog.sqlViewName: 'ZV_BTSITE_C'
@EndUserText.label: 'BuildTrack Site'
@OData.publish: true
@Search.searchable: true

@UI.presentationVariant: [{
    sortOrder: [{
        by: 'site_code',
        direction: #ASC
    }]
}]

define view ZC_BT_SITE
  as select from ZCDS_BT_SITE
{
    key site_id,

    // 🔍 SEARCH
    @Search.defaultSearchElement: true
    @UI.lineItem: [{ position: 10 }]
    site_code,

    @Search.defaultSearchElement: true
    @UI.lineItem: [{ position: 20 }]
    site_name,

    // 🎛 FILTER + DISPLAY
    @UI.selectionField: [{ position: 10 }]
    @UI.lineItem: [{ position: 30 }]
    status,

    @UI.lineItem: [{ position: 40 }]
    address,

    // (optional hiển thị project)
    @UI.lineItem: [{ position: 50 }]
    project_id
}
