import typer

from cad.commands import ui

assemblies = typer.Typer()


@assemblies.command("list", help="List all registered CAD assemblies")
def list_assemblies():
    from cad.registry import registry

    assemblies = registry().get("assemblies", {})
    ui.print_table(
        data=[
            {
                "Name": name,
                "Class": data["class"].__name__,
                "Params": ", ".join(data.get("params", {}).keys()),
            }
            for name, data in assemblies.items()
        ]
    )
