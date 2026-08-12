def print_table(data: list[dict]) -> None:
    if not data:
        print("No data to display")
        return

    headers = list(data[0].keys())
    rows = [[str(row.get(header, "")) for header in headers] for row in data]

    # Calculate column widths
    col_widths = [max(len(str(item)) for item in col) for col in zip(*rows, headers)]

    # Print header
    header_row = " | ".join(
        f"{header:<{col_widths[i]}}" for i, header in enumerate(headers)
    )
    print(header_row)
    print("-" * len(header_row))

    # Print rows
    for row in rows:
        print(" | ".join(f"{item:<{col_widths[i]}}" for i, item in enumerate(row)))
