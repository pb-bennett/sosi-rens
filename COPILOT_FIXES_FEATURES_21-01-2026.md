#Rearranging filtering

##Overview
We will now revisit how this app filters the data. The current approach puts together in one stage filtering objects by three different fixed fields, and allowing the user to choose which fields should be kept on the filtered selection of objects.

The new approach will be to first allow the user to select which fields should be used to apply filters to the objects that will be kept in the output file. The user will then be able to choose which fields should be kept on the filtered selection of objects. This will happen on two separate steps in the UI. These will both happen before the user reaches the exclude by ID step.

## Object filtering step

Key changes to the object filtering step:

1. The user will be presented with a list of all available fields in the uploaded SOSI file.
2. The list of fields will appear as a grouping of buttons including the name of the field and a + symbol. Clicking the button will add the field to the list of active filters. Multiple field buttons can be on the same line. The selection should be clear and user friendly.
3. The order of the fields added to the active filters list will determine the order in which the filters are applied. The user can rearrange the order of the active filters by dragging and dropping them.
4. There will be a remove button on each active filter to allow the user to remove it from the list.
5. a total number of objects that will be kept after applying the filters will be displayed and updated as the user adds/removes/rearranges filters.
6. The list of fields will be searchable, and as the fields are added to the active filters list they will be removed from the available fields list.
7. Fields with a high cardinality (many unique values) will be marked with a warning icon and a tooltip explaining that using high cardinality fields may lead to very few objects being kept. A warning should be given if the user adds a high cardinality field to the active filters list.
8. There will be two tabs at the top of the step, one for Punkt and one for Ledning. The user will need to configure filters for both categories before proceeding to the next step. However the user does not need to apply the same filters to both categories.
9. Each field that is added to the filter list will then be expanded to show all unique values with checkboxes for that field in the uploaded SOSI file, along with a count of how many objects have that value that are sitll available after previous filters are applied. The user can then select which values for that field should be kept. These lists can be very long, so they should be scrollable with a fixed max height. These lists should also be searchable.
10. There will be a "Select All" and "Deselect All" button for each field to allow the user to quickly select or deselect all values for that field.
11. There will be a summary section at the top of the step showing the total number of objects in the uploaded file, the number of objects that will be kept after applying the filters, and the number of objects that will be excluded.
12. A dropdown menu will allow the user to import and export the current filter configuration as a JSON file. The export will contain all filters and exclusions currently applied. This same dropdown will be present in the field selection and exclusion by ID and export steps to allow the user to import/export the entire configuration at any step.

## Field selection step

Key changes to the field selection step:

1. This step will remain largely the same as in the current version of the app, however with its own dedicated step in the UI.
2. The choices will again be on two tabs, one for Punkt and one for Ledning. These tabs should be styled in the same way, in the same section of the UI as the object filtering step.
3. The user will be presented with a list of all available fields in the uploaded SOSI file.
4. The list should be scrollable with a fixed max height, and searchable.
5. Each field will have a checkbox to allow the user to select whether that field should be kept in the output file.
6. There will be a "Select All" and "Deselect All" button to allow the user to quickly select or deselect all fields.
7. Remember to keep the mandatory fields (e.g. EGS_PUNKT, EGS_LEDNING) always selected and disabled so the user cannot deselect them.
8. Remember to have dropdown menu to allow the user to import and export the current field selection configuration as a JSON file. The export will contain all filters and exclusions currently applied. This same dropdown will be present in the object filtering and exclusion by ID and export steps to allow the user to import/export the entire configuration at any step.

## Exclusion by ID step

1. This step will remain largely the same as in the current version of the app with its own dedicated step in the UI.
2. Care should be taken to ensure styling consistency with the previous two steps.
3. Remember to have dropdown menu to allow the user to import and export the current field selection configuration as a JSON file. The export will contain all filters and exclusions currently applied. This same dropdown will be present in the object filtering and exclusion by ID and export steps to allow the user to import/export the entire configuration at any step.

## Other thoughts

1. I feel now is a good time for us to install a complete set of icons for the app that we can use throughout the app. I suggest we use Lucide (https://lucide.dev/) as it is open source (MIT license) and has a good selection of modern icons. What do you think?
2. At each step in the UI we should have a brief but clear explanation of what the user should do in that step. We can add this as a text section at the top of each step - the position should be consistent across all steps and made obvious with styling.
