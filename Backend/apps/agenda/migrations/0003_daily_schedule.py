from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('agenda', '0002_public_booking')]
    operations = [
        migrations.CreateModel(
            name='DailySchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('profesional_id', models.BigIntegerField()),
                ('fecha', models.DateField()),
                ('franjas', models.JSONField(default=list)),
                ('actualizado_por_id', models.BigIntegerField(null=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
            ],
            options={'default_permissions': (), 'constraints': [models.UniqueConstraint(fields=('profesional_id','fecha'), name='agenda_professional_day_unique')]},
        ),
        migrations.RunSQL(
            'ALTER TABLE agenda_dailyschedule ADD CONSTRAINT daily_schedule_professional_fk FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE RESTRICT; ALTER TABLE agenda_dailyschedule ADD CONSTRAINT daily_schedule_actor_fk FOREIGN KEY (actualizado_por_id) REFERENCES auth_user(id) ON DELETE SET NULL',
            'ALTER TABLE agenda_dailyschedule DROP CONSTRAINT daily_schedule_professional_fk; ALTER TABLE agenda_dailyschedule DROP CONSTRAINT daily_schedule_actor_fk',
        ),
    ]
