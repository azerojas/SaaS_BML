from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('agenda', '0003_daily_schedule')]
    operations = [
        migrations.AlterField(model_name='dailyschedule', name='profesional_id',
                              field=models.BigIntegerField(blank=True, null=True)),
        migrations.AddConstraint(model_name='dailyschedule', constraint=models.UniqueConstraint(
            fields=('fecha',), condition=models.Q(profesional_id__isnull=True), name='agenda_general_day_unique')),
    ]
