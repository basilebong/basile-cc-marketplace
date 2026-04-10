from rest_framework import serializers
from .models import User, Team, Project


class UserSerializer(serializers.ModelSerializer):
    team_ids = serializers.PrimaryKeyRelatedField(
        source="teams", many=True, read_only=True
    )

    class Meta:
        model = User
        fields = ["id", "email", "display_name", "avatar_url", "team_ids"]
        read_only_fields = ["id", "email"]


class TeamSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    member_count = serializers.IntegerField(source="members.count", read_only=True)

    class Meta:
        model = Team
        fields = ["id", "name", "slug", "members", "member_count", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


class ProjectSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(source="tasks.count", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "name", "description", "team", "color", "archived", "task_count", "created_at"]
        read_only_fields = ["id", "created_at"]
