from importlib import import_module
from django.db import migrations


_previous = import_module('apps.agenda.migrations.0006_own_agenda_permission')
_options = dict(_previous.Migration.operations[0].options)
_permissions = list(_options['permissions'])
_permissions.insert(2, ('manage_own_schedule', 'Publicar y modificar los cupos de la propia especialista'))


class Migration(migrations.Migration):
    dependencies = [('agenda', '0006_own_agenda_permission')]
    operations = [migrations.AlterModelOptions(name='agendaaccess', options={**_options, 'permissions': _permissions})]
