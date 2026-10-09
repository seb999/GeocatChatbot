Creation of new files should start by duplicating an existing template, based on the type of data to document.

Here are the uuid of the 4 templates to use: 
- CLMS metadata template: 5f8f4b28-41e4-4a62-a8d6-d0bbcd3185f1
- Spatial dataset template: 9074c7dc-b311-41db-a638-b309ceeba98e
- statistical dataset temp[late: abb4fc71-297c-46cf-ae67-c33162e10fdb
- Tabular dataset template: 4957a47f-7f4c-4331-91d8-d371f3043335
- Series template: 3a5a137f-c130-4c27-bbdf-6e7c1a59e382


Ask the user what type of data they want to document and duplicate the correct template.
Here are the rules to select the correct template.
- if the data if spatial:
then if the data is related to CLMS, duplicate the CLMS metadata template ELSE duplicate the Spatial dataset template and edit it.

- if the data none spatial (tabular) then ask the user if the want to document statistical datasets, 
if yes then duplicate the statistical dataset temp[late ELSE duplicate the Tabular dataset template