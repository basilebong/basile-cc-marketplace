from rest_framework import serializers
from .models import Task, Comment, Attachment
from users.serializers import UserSerializer


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "task", "author", "body", "created_at"]
        read_only_fields = ["id", "task", "author", "created_at"]


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "task", "uploaded_by", "file_url", "filename", "size_bytes", "created_at"]
        read_only_fields = ["id", "uploaded_by", "created_at"]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class TaskSerializer(serializers.ModelSerializer):
    assignee = UserSerializer(read_only=True)
    assignee_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    comment_count = serializers.IntegerField(source="comments.count", read_only=True)
    attachment_count = serializers.IntegerField(source="attachments.count", read_only=True)

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "status", "priority",
            "assignee", "assignee_id", "project", "due_date",
            "created_at", "updated_at", "comment_count", "attachment_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        assignee_id = validated_data.pop("assignee_id", None)
        if assignee_id:
            validated_data["assignee_id"] = assignee_id
        return super().create(validated_data)

    # BUG: updating assignee_id doesn't trigger any notification to the new assignee
    def update(self, instance, validated_data):
        assignee_id = validated_data.pop("assignee_id", None)
        if assignee_id is not None:
            instance.assignee_id = assignee_id
        return super().update(instance, validated_data)
