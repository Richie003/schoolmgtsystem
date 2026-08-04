from rest_framework import serializers

from core.models import School


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = [
            'id', 'name', 'display_name', 'slug', 'code', 'email', 'phone',
            'address', 'logo', 'brand_color', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at']


class SchoolSummarySerializer(serializers.ModelSerializer):
    """Lightweight nested representation, e.g. inside the /auth/me payload.

    Branding travels with the user so the SPA can theme itself on first paint,
    without a second request.
    """

    class Meta:
        model = School
        fields = ['id', 'name', 'display_name', 'code', 'logo', 'brand_color']


class SchoolBrandingSerializer(serializers.ModelSerializer):
    """What a school admin may change about their own school's appearance."""

    class Meta:
        model = School
        fields = ['id', 'name', 'display_name', 'code', 'logo', 'brand_color']
        read_only_fields = ['id', 'code']

    def validate_brand_color(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Choose a brand colour.')

        # Expand #abc to #aabbcc so the client only ever sees one format.
        if len(value) == 4:
            value = '#' + ''.join(char * 2 for char in value[1:])
        return value.lower()

    def validate_logo(self, value):
        if value and value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError('Logo must be smaller than 2 MB.')
        return value
