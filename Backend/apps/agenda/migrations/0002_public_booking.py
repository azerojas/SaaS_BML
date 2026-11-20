import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('agenda', '0001_agenda_permissions')]
    operations = [
        migrations.CreateModel(
            name='PublicBookingRequest',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('management_token', models.UUIDField(default=uuid.uuid4, unique=True, editable=False)),
                ('nombres', models.CharField(max_length=120)),
                ('apellidos', models.CharField(max_length=120)),
                ('telefono', models.CharField(max_length=25)),
                ('profesional_id', models.BigIntegerField()),
                ('servicios', models.JSONField()),
                ('inicio_en', models.DateTimeField()),
                ('fin_en', models.DateTimeField()),
                ('precio_total', models.DecimalField(max_digits=12, decimal_places=2)),
                ('duracion_minutos', models.PositiveIntegerField()),
                ('estado', models.CharField(max_length=14, default='PENDIENTE')),
                ('appointment_id', models.BigIntegerField(null=True, unique=True)),
                ('version_aviso', models.CharField(max_length=100)),
                ('motivo_publico', models.CharField(max_length=250, default='')),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('expira_en', models.DateTimeField(db_index=True)),
            ],
            options={'default_permissions': ()},
        ),
        migrations.RunSQL(
            'ALTER TABLE agenda_publicbookingrequest ADD CONSTRAINT public_request_appointment_fk FOREIGN KEY (appointment_id) REFERENCES citas(id) ON DELETE RESTRICT; ALTER TABLE agenda_publicbookingrequest ADD CONSTRAINT public_request_professional_fk FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE RESTRICT',
            'ALTER TABLE agenda_publicbookingrequest DROP CONSTRAINT public_request_appointment_fk; ALTER TABLE agenda_publicbookingrequest DROP CONSTRAINT public_request_professional_fk',
        ),
        migrations.CreateModel(
            name='PublicBookingIntent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('owner_hash', models.CharField(max_length=64)),
                ('key', models.UUIDField()),
                ('fingerprint', models.CharField(max_length=64)),
                ('result', models.JSONField()),
            ],
            options={'default_permissions': (), 'constraints': [models.UniqueConstraint(fields=('owner_hash', 'key'), name='public_booking_intent_owner_key')]},
        ),
    ]

