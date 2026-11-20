from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('agenda', '0007_own_schedule_permission')]
    operations = [
        migrations.CreateModel(
            name='CalendarArchive',
            fields=[
                ('appointment_id', models.BigIntegerField(primary_key=True, serialize=False)),
                ('archived_at', models.DateTimeField(auto_now_add=True)),
                ('actor_id', models.BigIntegerField()),
            ],
            options={'default_permissions': ()},
        ),
        migrations.RunSQL(
            'ALTER TABLE agenda_calendararchive ADD CONSTRAINT agenda_archive_appointment_fk '
            'FOREIGN KEY (appointment_id) REFERENCES citas(id) ON DELETE CASCADE',
            'ALTER TABLE agenda_calendararchive DROP CONSTRAINT agenda_archive_appointment_fk',
        ),
    ]
