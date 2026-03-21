# 🚀 BuildTrack – Generate Fiori List Report from CDS

## 🎯 Objective

Create a Fiori Elements **List Report Object Page** application based on CDS view:

* **Service**: `ZC_BT_PROJECT_CDS`
* **Entity**: `ZC_BT_PROJECT`

---

## 🧱 Backend Status (Already Completed)

* CDS Basic View: `ZCDS_BT_PROJECT`
* CDS Consumption View: `ZC_BT_PROJECT`
* Annotation:

  * `@OData.publish: true`
  * `@UI.lineItem`
  * `@UI.selectionField`
  * `@Search.searchable`
* OData Service: ✅ Activated & Registered (`/IWFND/MAINT_SERVICE`)

---

## 🛠️ Task: Create Fiori App

### 1. Create Application

Use template:

```
List Report Object Page
```

---

### 2. Data Source Configuration

| Field         | Value             |
| ------------- | ----------------- |
| Service       | ZC_BT_PROJECT_CDS |
| Entity Set    | ZC_BT_PROJECT     |
| OData Version | V2                |

---

### 3. Expected Features (Auto from CDS)

The app should automatically support:

* 🔍 **Search**

  * By: `project_code`, `project_name`

* 🎛 **Filter Bar**

  * `status`
  * `project_type`
  * `start_date`
  * `end_date`

* 📊 **Table Columns**

  * Project Code
  * Project Name
  * Type
  * Start Date
  * End Date
  * Status

* 🔃 **Default Sorting**

  * `start_date DESC`

---

### 4. Navigation (Object Page)

* Enable navigation from List → Object Page
* Key field: `project_id`

---

## 🔥 Optional Enhancements

### 1. Value Help (Dropdown)

* `status`
* `project_type`

---

## ✅ Acceptance Criteria

* App loads without error
* Data is displayed correctly
* Search & Filter working
* Sorting applied (Start Date DESC)
* Navigation to Object Page works

---

@AbapCatalog.sqlViewName: 'ZV_BTPROJ'
@EndUserText.label: 'BuildTrack Project Basic'

define view ZCDS_BT_PROJECT
  as select from zbt_project
{
    key project_id,

    project_code,
    project_name,
    project_type,
    start_date,
    end_date,
    status,

    created_by,
    created_on,
    created_at,
    updated_by,
    updated_on,
    updated_at
}

@AbapCatalog.sqlViewName: 'ZV_BTPRJ_C'
@EndUserText.label: 'BuildTrack Project'
@OData.publish: true
@Search.searchable: true

@UI.presentationVariant: [{
    sortOrder: [{
        by: 'start_date',
        direction: #DESC
    }]
}]

define view ZC_BT_PROJECT
  as select from ZCDS_BT_PROJECT
{
    key project_id,

    // 🔍 SEARCH
    @Search.defaultSearchElement: true
    @UI.lineItem: [{ position: 10 }]
    project_code,

    @Search.defaultSearchElement: true
    @UI.lineItem: [{ position: 20 }]
    project_name,

    // 🎛 FILTER + DISPLAY
    @UI.selectionField: [{ position: 20 }]
    @UI.lineItem: [{ position: 30 }]
    project_type,

    @UI.selectionField: [{ position: 30 }]
    @UI.lineItem: [{ position: 40 }]
    start_date,

    @UI.selectionField: [{ position: 40 }]
    @UI.lineItem: [{ position: 50 }]
    end_date,

    @UI.selectionField: [{ position: 10 }]
    @UI.lineItem: [{ position: 60 }]
    status
}
