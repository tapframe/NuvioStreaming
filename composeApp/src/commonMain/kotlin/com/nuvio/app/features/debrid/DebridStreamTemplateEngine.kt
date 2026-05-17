package com.nuvio.app.features.debrid

import kotlin.math.abs
import kotlin.math.roundToLong

internal data class DebridTemplateBytes(val value: Long)

class DebridStreamTemplateEngine {
    fun render(template: String, values: Map<String, Any?>): String {
        if (template.isEmpty()) return ""
        val out = StringBuilder()
        var index = 0
        while (index < template.length) {
            val start = template.indexOf('{', index)
            if (start < 0) {
                out.append(template.substring(index))
                break
            }
            out.append(template.substring(index, start))
            val end = findPlaceholderEnd(template, start + 1)
            if (end < 0) {
                out.append(template.substring(start))
                break
            }
            val expression = template.substring(start + 1, end)
            out.append(renderExpression(expression, values))
            index = end + 1
        }
        return out.toString()
    }

    private fun renderExpression(expression: String, values: Map<String, Any?>): String {
        val bracket = findTopLevelChar(expression, '[')
        if (bracket >= 0 && expression.endsWith("]")) {
            val condition = expression.substring(0, bracket)
            val branches = parseBranches(expression.substring(bracket + 1, expression.length - 1))
            val selected = if (evaluateCondition(condition, values)) branches.first else branches.second
            return render(selected, values)
        }

        val tokens = splitOps(expression)
        if (tokens.isEmpty()) return ""
        var value: Any? = values[tokens.first()]
        tokens.drop(1).forEach { op ->
            value = applyTransform(value, op)
        }
        return valueToText(value)
    }

    private fun evaluateCondition(expression: String, values: Map<String, Any?>): Boolean {
        val tokens = splitOps(expression).filter { it.isNotBlank() }
        if (tokens.isEmpty()) return false
        val groups = mutableListOf<MutableList<Boolean>>()
        var currentGroup = mutableListOf<Boolean>()
        var index = 0
        while (index < tokens.size) {
            when (tokens[index]) {
                "or" -> {
                    groups += currentGroup
                    currentGroup = mutableListOf()
                    index++
                }
                "and" -> index++
                else -> {
                    val field = tokens[index]
                    index++
                    val ops = mutableListOf<String>()
                    while (
                        index < tokens.size &&
                        tokens[index] != "and" &&
                        tokens[index] != "or" &&
                        !tokens[index].isFieldPath()
                    ) {
                        ops += tokens[index]
                        index++
                    }
                    currentGroup += evaluateSingleCondition(values[field], ops)
                }
            }
        }
        groups += currentGroup
        return groups.any { group -> group.isNotEmpty() && group.all { it } }
    }

    private fun evaluateSingleCondition(value: Any?, ops: List<String>): Boolean {
        if (ops.isEmpty()) return isTruthy(value)
        var result = false
        var hasResult = false
        ops.forEach { op ->
            when {
                op == "exists" -> {
                    result = exists(value)
                    hasResult = true
                }
                op == "istrue" -> {
                    result = if (hasResult) result else asBoolean(value) == true
                    hasResult = true
                }
                op == "isfalse" -> {
                    result = if (hasResult) !result else asBoolean(value) == false
                    hasResult = true
                }
                op.startsWith("~=") -> {
                    result = containsText(value, op.drop(2).trim())
                    hasResult = true
                }
                op.startsWith("~") -> {
                    result = containsText(value, op.drop(1).trim())
                    hasResult = true
                }
                op.startsWith("=") -> {
                    result = equalsText(value, op.drop(1).trim())
                    hasResult = true
                }
                op.startsWith(">=") -> {
                    result = compareNumber(value, op.drop(2)) { left, right -> left >= right }
                    hasResult = true
                }
                op.startsWith("<=") -> {
                    result = compareNumber(value, op.drop(2)) { left, right -> left <= right }
                    hasResult = true
                }
                op.startsWith(">") -> {
                    result = compareNumber(value, op.drop(1)) { left, right -> left > right }
                    hasResult = true
                }
                op.startsWith("<") -> {
                    result = compareNumber(value, op.drop(1)) { left, right -> left < right }
                    hasResult = true
                }
            }
        }
        return result
    }

    private fun applyTransform(value: Any?, op: String): Any? =
        when {
            op == "title" -> valueToText(value).titleCased()
            op == "lower" -> valueToText(value).lowercase()
            op == "upper" -> valueToText(value).uppercase()
            op == "bytes" -> asNumber(value)?.let { formatBytes(it) }.orEmpty()
            op == "time" -> asNumber(value)?.let { formatTime(it) }.orEmpty()
            op.startsWith("join(") -> {
                val separator = parseArgs(op).firstOrNull() ?: ", "
                when (value) {
                    is Iterable<*> -> value.mapNotNull { valueToText(it).takeIf { text -> text.isNotBlank() } }.joinToString(separator)
                    else -> valueToText(value)
                }
            }
            op.startsWith("replace(") -> {
                val args = parseArgs(op)
                if (args.size < 2) valueToText(value) else valueToText(value).replace(args[0], args[1])
            }
            else -> value
        }

    private fun findPlaceholderEnd(text: String, start: Int): Int {
        var quote: Char? = null
        var index = start
        while (index < text.length) {
            val char = text[index]
            if (quote != null) {
                if (char == quote && (index == 0 || text[index - 1] != '\\')) quote = null
            } else {
                when (char) {
                    '\'', '"' -> quote = char
                    '}' -> return index
                }
            }
            index++
        }
        return -1
    }

    private fun findTopLevelChar(text: String, target: Char): Int {
        var quote: Char? = null
        var parenDepth = 0
        text.forEachIndexed { index, char ->
            if (quote != null) {
                if (char == quote && (index == 0 || text[index - 1] != '\\')) quote = null
                return@forEachIndexed
            }
            when (char) {
                '\'', '"' -> quote = char
                '(' -> parenDepth++
                ')' -> parenDepth = (parenDepth - 1).coerceAtLeast(0)
                target -> if (parenDepth == 0) return index
            }
        }
        return -1
    }

    private fun splitOps(text: String): List<String> {
        val tokens = mutableListOf<String>()
        var quote: Char? = null
        var parenDepth = 0
        var start = 0
        var index = 0
        while (index < text.length) {
            val char = text[index]
            if (quote != null) {
                if (char == quote && text.getOrNull(index - 1) != '\\') quote = null
                index++
                continue
            }
            when (char) {
                '\'', '"' -> quote = char
                '(' -> parenDepth++
                ')' -> parenDepth = (parenDepth - 1).coerceAtLeast(0)
                ':' -> {
                    if (parenDepth == 0 && text.getOrNull(index + 1) == ':') {
                        tokens += text.substring(start, index).trim()
                        index += 2
                        start = index
                        continue
                    }
                }
            }
            index++
        }
        tokens += text.substring(start).trim()
        return tokens.filter { it.isNotEmpty() }
    }

    private fun parseBranches(text: String): Pair<String, String> {
        val split = findBranchSeparator(text)
        if (split < 0) return parseQuoted(text) to ""
        return parseQuoted(text.substring(0, split)) to parseQuoted(text.substring(split + 2))
    }

    private fun findBranchSeparator(text: String): Int {
        var quote: Char? = null
        text.forEachIndexed { index, char ->
            if (quote != null) {
                if (char == quote && text.getOrNull(index - 1) != '\\') quote = null
                return@forEachIndexed
            }
            when (char) {
                '\'', '"' -> quote = char
                '|' -> if (text.getOrNull(index + 1) == '|') return index
            }
        }
        return -1
    }

    private fun parseArgs(op: String): List<String> {
        val start = op.indexOf('(')
        val end = op.lastIndexOf(')')
        if (start < 0 || end <= start) return emptyList()
        val body = op.substring(start + 1, end)
        val args = mutableListOf<String>()
        var quote: Char? = null
        var argStart = 0
        body.forEachIndexed { index, char ->
            if (quote != null) {
                if (char == quote && body.getOrNull(index - 1) != '\\') quote = null
                return@forEachIndexed
            }
            when (char) {
                '\'', '"' -> quote = char
                ',' -> {
                    args += parseQuoted(body.substring(argStart, index))
                    argStart = index + 1
                }
            }
        }
        args += parseQuoted(body.substring(argStart))
        return args
    }

    private fun parseQuoted(raw: String): String {
        val trimmed = raw.trim()
        val unquoted = if (
            trimmed.length >= 2 &&
            ((trimmed.first() == '"' && trimmed.last() == '"') ||
                (trimmed.first() == '\'' && trimmed.last() == '\''))
        ) {
            trimmed.substring(1, trimmed.length - 1)
        } else {
            trimmed
        }
        return unquoted
            .replace("\\n", "\n")
            .replace("\\\"", "\"")
            .replace("\\'", "'")
            .replace("\\\\", "\\")
    }

    private fun String.isFieldPath(): Boolean =
        startsWith("stream.") || startsWith("service.") || startsWith("addon.")

    private fun exists(value: Any?): Boolean =
        when (value) {
            null -> false
            is String -> value.isNotBlank()
            is Iterable<*> -> value.any()
            is Array<*> -> value.isNotEmpty()
            else -> true
        }

    private fun isTruthy(value: Any?): Boolean =
        when (value) {
            is Boolean -> value
            is DebridTemplateBytes -> value.value != 0L
            is Number -> value.toDouble() != 0.0
            else -> exists(value)
        }

    private fun asBoolean(value: Any?): Boolean? =
        when (value) {
            is Boolean -> value
            is String -> value.toBooleanStrictOrNull()
            else -> null
        }

    private fun asNumber(value: Any?): Double? =
        when (value) {
            is Number -> value.toDouble()
            is DebridTemplateBytes -> value.value.toDouble()
            is String -> value.toDoubleOrNull()
            else -> null
        }

    private fun compareNumber(value: Any?, rawTarget: String, compare: (Double, Double) -> Boolean): Boolean {
        val left = asNumber(value) ?: return false
        val right = rawTarget.trim().toDoubleOrNull() ?: return false
        return compare(left, right)
    }

    private fun equalsText(value: Any?, target: String): Boolean =
        when (value) {
            is Iterable<*> -> value.any { valueToText(it).trim().equals(target, ignoreCase = true) }
            else -> valueToText(value).trim().equals(target, ignoreCase = true)
        }

    private fun containsText(value: Any?, target: String): Boolean =
        when (value) {
            is Iterable<*> -> value.any { valueToText(it).contains(target, ignoreCase = true) }
            else -> valueToText(value).contains(target, ignoreCase = true)
        }

    private fun valueToText(value: Any?): String =
        when (value) {
            null -> ""
            is Iterable<*> -> value.mapNotNull { valueToText(it).takeIf { text -> text.isNotBlank() } }.joinToString(", ")
            is DebridTemplateBytes -> formatBytes(value.value.toDouble())
            is Double -> if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
            is Float -> if (value % 1f == 0f) value.toLong().toString() else value.toString()
            else -> value.toString()
        }

    private fun String.titleCased(): String =
        split(Regex("\\s+"))
            .joinToString(" ") { word ->
                if (word.isBlank()) {
                    word
                } else {
                    word.lowercase().replaceFirstChar { char ->
                        if (char.isLowerCase()) char.titlecase() else char.toString()
                    }
                }
            }

    private fun formatBytes(value: Double): String {
        val bytes = abs(value)
        if (bytes < 1024.0) return "${value.toLong()} B"
        val units = listOf("KB", "MB", "GB", "TB")
        var current = bytes
        var unitIndex = -1
        while (current >= 1024.0 && unitIndex < units.lastIndex) {
            current /= 1024.0
            unitIndex++
        }
        val signed = if (value < 0) -current else current
        return if (signed >= 10 || signed % 1.0 == 0.0) {
            "${signed.toLong()} ${units[unitIndex]}"
        } else {
            val tenths = (signed * 10.0).roundToLong()
            "${tenths / 10}.${abs(tenths % 10)} ${units[unitIndex]}"
        }
    }

    private fun formatTime(value: Double): String {
        val seconds = value.toLong()
        val hours = seconds / 3600
        val minutes = (seconds % 3600) / 60
        val remainingSeconds = seconds % 60
        return when {
            hours > 0 -> "${hours}h ${minutes}m"
            minutes > 0 -> "${minutes}m ${remainingSeconds}s"
            else -> "${remainingSeconds}s"
        }
    }
}
