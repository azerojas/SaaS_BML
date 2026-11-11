from django.db import migrations
from apps.integracion.user_links import restore_links, remove_links


class Migration(migrations.Migration):
    dependencies = [('auth', '0012_alter_user_first_name_max_length')]
    operations = [migrations.RunPython(restore_links, remove_links)]

