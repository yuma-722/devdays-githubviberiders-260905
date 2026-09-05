using System.Net;
using System.Text.Json;

namespace Survey;

public sealed class SurveyRequestException(HttpStatusCode statusCode, string message)
    : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
    public string Code => StatusCode == HttpStatusCode.BadRequest ? "INVALID_REQUEST" : "VALIDATION_ERROR";
}

public static class SurveyRequestParser
{
    public static async Task<SurveyInput> ParseAsync(Stream body, CancellationToken cancellationToken = default)
    {
        using JsonDocument document = await JsonDocument.ParseAsync(body, cancellationToken: cancellationToken);
        JsonElement root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw InvalidType("リクエストはJSONオブジェクトで指定してください。");
        }

        string[] communities = ReadArray(root, "communityAffiliation");
        string[] roles = ReadArray(root, "jobRole");
        string? otherRole = ReadOptionalString(root, "jobRoleOther");
        string? feedback = ReadOptionalString(root, "feedback");
        if (!root.TryGetProperty("eventRating", out JsonElement rating) || rating.ValueKind == JsonValueKind.Null)
        {
            throw InvalidRule("eventRatingは必須です。");
        }
        if (rating.ValueKind != JsonValueKind.Number || !rating.TryGetInt32(out int eventRating))
        {
            throw InvalidType("eventRatingは整数で指定してください。");
        }

        ValidateRules(communities, roles, otherRole, eventRating, feedback);
        return new SurveyInput(
            communities.Distinct(StringComparer.Ordinal).ToArray(),
            roles.Distinct(StringComparer.Ordinal).ToArray(),
            otherRole, eventRating, feedback);
    }

    public static void ValidateRules(
        string[] communities, string[] roles, string? otherRole, int rating, string? feedback)
    {
        if (communities.Any(value => !SurveyOptions.Communities.Contains(value, StringComparer.Ordinal)))
        {
            throw InvalidRule("communityAffiliationに無効な選択肢が含まれています。");
        }
        if (roles.Length == 0 || roles.Any(value => !SurveyOptions.JobRoles.Contains(value, StringComparer.Ordinal)))
        {
            throw InvalidRule("jobRoleは有効な選択肢を1つ以上指定してください。");
        }
        if (roles.Contains(SurveyOptions.OtherJobRole, StringComparer.Ordinal) && string.IsNullOrWhiteSpace(otherRole))
        {
            throw InvalidRule("その他の職種を入力してください。");
        }
        if (otherRole?.Length > 100)
        {
            throw InvalidRule("jobRoleOtherは100文字以内で指定してください。");
        }
        if (rating is < 1 or > 5)
        {
            throw InvalidRule("eventRatingは1から5で指定してください。");
        }
        if (feedback?.Length > 1000)
        {
            throw InvalidRule("feedbackは1000文字以内で指定してください。");
        }
    }

    private static string[] ReadArray(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out JsonElement value) || value.ValueKind == JsonValueKind.Null)
        {
            throw InvalidRule($"{name}は必須です。");
        }
        if (value.ValueKind != JsonValueKind.Array)
        {
            throw InvalidType($"{name}は配列で指定してください。");
        }
        List<string> result = [];
        foreach (JsonElement item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                throw InvalidType($"{name}の要素は文字列で指定してください。");
            }
            result.Add(item.GetString()!);
        }
        return result.ToArray();
    }

    private static string? ReadOptionalString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out JsonElement value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        if (value.ValueKind != JsonValueKind.String)
        {
            throw InvalidType($"{name}は文字列で指定してください。");
        }
        return value.GetString();
    }

    private static SurveyRequestException InvalidType(string message) => new(HttpStatusCode.BadRequest, message);
    private static SurveyRequestException InvalidRule(string message) => new(HttpStatusCode.UnprocessableEntity, message);
}
