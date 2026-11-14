/** Collections plugin — manager editor field registration. */
import CollectionTreeField from '../components/schema/fields/CollectionTreeField.vue'
import { registerSchemaField } from '../data/schemaFields'

registerSchemaField('collection-tree', CollectionTreeField)
registerSchemaField('collection-editor', CollectionTreeField)
