from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('agenda', '0004_shared_schedule')]

    operations = [
        migrations.AddField(
            model_name='publicbookingrequest',
            name='management_code_hash',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddIndex(
            model_name='publicbookingrequest',
            index=models.Index(
                fields=['telefono', 'management_code_hash'],
                name='agenda_public_phone_code_idx',
            ),
        ),
    ]
